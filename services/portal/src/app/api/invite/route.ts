import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import prisma from '@/lib/prisma';
import { t as translate, Language } from '@/lib/translations';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'lasernet-secret-change-this-in-production'
);

export async function POST(request: NextRequest) {
  try {
    const { email, name, role, companyName } = await request.json();

    if (!email || !name) {
      return NextResponse.json(
        { error: 'Email and name are required' },
        { status: 400 }
      );
    }

    // Generate invite token (7-day expiry)
    const inviteToken = await new SignJWT({
      email,
      name,
      role,
      companyName,
      purpose: 'invite',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    // Try to send email via Gmail SMTP
    const emailSent = await sendInvitationEmail(
      email,
      name,
      role,
      companyName,
      inviteToken
    );

    // Return success even if email fails (graceful degradation)
    return NextResponse.json(
      {
        success: true,
        inviteToken,
        emailSent,
        message: emailSent
          ? 'Invitation sent successfully'
          : 'User created but email could not be sent. Share the setup link manually.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function sendInvitationEmail(
  email: string,
  name: string,
  role: string,
  companyName: string,
  inviteToken: string
): Promise<boolean> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPassword) {
    console.warn(
      'Gmail credentials not configured. Skipping email send. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local'
    );
    return false;
  }

  try {
    // Look up recipient's language preference
    const user = await prisma.user.findFirst({
      where: { email },
      select: { language: true },
    });
    const lang = (user?.language as Language) || 'fr';

    // Dynamically import nodemailer (it's optional)
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.default.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPassword,
      },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const setupUrl = `${baseUrl}/setup-account?token=${encodeURIComponent(
      inviteToken
    )}`;

    const subject = translate('emails', 'inviteSubject', lang);
    const greeting = translate('emails', 'inviteGreeting', lang);
    const bodyText = translate('emails', 'inviteBody', lang);
    const buttonText = translate('emails', 'inviteButton', lang);

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: white; padding: 40px 20px; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
    .footer { background: #f5f5f5; padding: 20px; border-bottom: 1px solid #e0e0e0; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #999; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
    .cta-button:hover { background: linear-gradient(135deg, #0052a3 0%, #003d7a 100%); }
    .info-box { background: #f0f7ff; border-left: 4px solid #0066cc; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .info-label { color: #0066cc; font-weight: 600; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
    .info-value { font-size: 16px; color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${lang === 'fr' ? 'Bienvenue au Portail LaserNet' : 'Welcome to LaserNet Portal'}</h1>
    </div>

    <div class="content">
      <p>${greeting} <strong>${escapeHtml(name)}</strong>,</p>

      <p>${bodyText} ${lang === 'fr' ? 'en tant que' : 'as a'} <strong>${escapeHtml(role)}</strong> ${lang === 'fr' ? 'chez' : 'at'} <strong>${escapeHtml(companyName)}</strong>.</p>

      <p>${lang === 'fr' ? 'Configurez votre compte et commencez à accéder à votre portail dès aujourd\'hui :' : 'Set up your account and start accessing your portal today:'}</p>

      <div style="text-align: center;">
        <a href="${setupUrl}" class="cta-button" style="background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;"><span style="color: #ffffff !important;">${buttonText}</span></a>
      </div>

      <div class="info-box">
        <div class="info-label">${lang === 'fr' ? 'DÉTAILS DU COMPTE' : 'ACCOUNT DETAILS'}</div>
        <div class="info-value">${lang === 'fr' ? 'Courriel' : 'Email'}: ${escapeHtml(email)}</div>
        <div class="info-value" style="margin-top: 8px;">${lang === 'fr' ? 'Entreprise' : 'Company'}: ${escapeHtml(companyName)}</div>
        <div class="info-value" style="margin-top: 8px;">${lang === 'fr' ? 'Rôle' : 'Role'}: ${escapeHtml(role)}</div>
      </div>

      <p>${lang === 'fr' ? 'Ce lien d\'invitation expirera dans 7 jours. Si vous ne configurez pas votre compte d\'ici là, veuillez contacter votre administrateur pour une nouvelle invitation.' : 'This invitation link will expire in 7 days. If you don\'t set up your account by then, please contact your administrator for a new invitation.'}</p>

      <p>${lang === 'fr' ? 'Si vous n\'aviez pas prévu cette invitation, vous pouvez ignorer cet e-mail en toute sécurité.' : 'If you didn\'t expect this invitation, you can safely ignore this email.'}</p>
    </div>

    <div class="footer">
      <p>&copy; 2026 LaserNet Portal. All rights reserved.</p>
      <p>${lang === 'fr' ? 'Questions ?' : 'Questions?'} ${lang === 'fr' ? 'Contactez votre administrateur.' : 'Contact your administrator.'}</p>
    </div>
  </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from: gmailUser,
      to: email,
      subject,
      html: htmlContent,
    });

    console.log(`Invitation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending invitation email:', error);
    return false;
  }
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
