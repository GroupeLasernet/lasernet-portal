import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { getUserByEmail, updateUser } from '@/lib/users';
import prisma from '@/lib/prisma';
import { t as translate, Language } from '@/lib/translations';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'lasernet-secret-change-this-in-production'
);

// POST /api/reset-password — Send reset email
export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Generate reset token (1-hour expiry)
    const resetToken = await new SignJWT({
      email,
      purpose: 'password-reset',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(JWT_SECRET);

    // Send reset email
    const emailSent = await sendResetEmail(email, name || email, resetToken);

    return NextResponse.json({
      success: true,
      emailSent,
      message: emailSent
        ? 'Password reset email sent successfully'
        : 'Could not send email. Gmail credentials may not be configured.',
    });
  } catch (error) {
    console.error('Error processing password reset:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/reset-password — Apply the new password using the token
export async function PATCH(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Verify the token
    let payload;
    try {
      const result = await jwtVerify(token, JWT_SECRET);
      payload = result.payload;
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 401 }
      );
    }

    if (payload.purpose !== 'password-reset') {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const email = payload.email as string;

    // Update the user's password
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email' },
        { status: 404 }
      );
    }

    await updateUser(email, { password: newPassword });

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function sendResetEmail(
  email: string,
  name: string,
  resetToken: string
): Promise<boolean> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPassword) {
    console.warn('Gmail credentials not configured. Skipping reset email.');
    return false;
  }

  try {
    // Look up recipient's language preference
    const user = await prisma.user.findFirst({
      where: { email },
      select: { language: true },
    });
    const lang = (user?.language as Language) || 'fr';

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
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const subject = translate('emails', 'resetSubject', lang);
    const greeting = translate('emails', 'resetGreeting', lang);
    const body = translate('emails', 'resetBody', lang);
    const buttonText = translate('emails', 'resetButton', lang);

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
    .cta-button { display: inline-block; background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
    .warning-box { background: #fff8e1; border-left: 4px solid #f9a825; padding: 16px; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${subject}</h1>
    </div>

    <div class="content">
      <p>${greeting} <strong>${escapeHtml(name)}</strong>,</p>

      <p>${body}</p>

      <div style="text-align: center;">
        <a href="${resetUrl}" class="cta-button" style="background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;"><span style="color: #ffffff !important;">${buttonText}</span></a>
      </div>

      <div class="warning-box">
        <strong>${lang === 'fr' ? 'Ce lien expire dans 1 heure.' : 'This link expires in 1 hour.'}</strong><br>
        ${lang === 'fr' ? 'Si vous n\'avez pas demandé une réinitialisation de mot de passe, vous pouvez ignorer cet e-mail en toute sécurité. Votre mot de passe restera inchangé.' : 'If you didn\'t request a password reset, you can safely ignore this email. Your password will remain unchanged.'}
      </div>

      <p style="font-size: 12px; color: #999;">${lang === 'fr' ? 'Si le bouton ne fonctionne pas, copiez et collez cette URL dans votre navigateur :' : 'If the button doesn\'t work, copy and paste this URL into your browser:'}</p>
      <p style="font-size: 11px; color: #666; word-break: break-all;">${resetUrl}</p>
    </div>

    <div class="footer">
      <p>&copy; 2026 LaserNet Portal. All rights reserved.</p>
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

    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending reset email:', error);
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
