// ============================================================
// Email helper — sends admin-flow emails via Gmail SMTP.
// Reuses the GMAIL_USER / GMAIL_APP_PASSWORD env vars already
// used by /api/invite and /api/reset-password.
// Returns true on success, false on any failure (caller falls
// back to showing a copy-paste URL).
// ============================================================

type NodemailerLike = {
  createTransport: (opts: unknown) => {
    sendMail: (opts: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }) => Promise<unknown>;
  };
};

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

async function getTransporter() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPassword) {
    console.warn('[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping send.');
    return null;
  }
  const mod = (await import('nodemailer')) as unknown as { default: NodemailerLike };
  const transporter = mod.default.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPassword },
  });
  return { transporter, from: gmailUser };
}

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: #fff; }
  .header { background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); color: #fff; padding: 32px 20px; text-align: center; }
  .header h1 { margin: 0; font-size: 22px; }
  .content { padding: 32px 24px; line-height: 1.55; }
  .cta-button { display: inline-block; background: #0066cc; color: #fff !important; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0; }
  .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; }
  .url-fallback { word-break: break-all; font-size: 12px; color: #666; background: #f7f7f7; padding: 10px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${escapeHtml(title)}</h1></div>
    <div class="content">${bodyHtml}</div>
    <div class="footer">&copy; 2026 LaserNet Portal</div>
  </div>
</body>
</html>`;
}

// ---------- Admin invite ----------
export async function sendAdminInviteEmail(opts: {
  to: string;
  name: string;
  inviteUrl: string;
  invitedBy?: string | null;
}): Promise<boolean> {
  try {
    const ctx = await getTransporter();
    if (!ctx) return false;

    const body = `
      <p>Bonjour <strong>${escapeHtml(opts.name)}</strong>,</p>
      <p>${opts.invitedBy ? `<strong>${escapeHtml(opts.invitedBy)}</strong> vous a invité` : 'Vous avez été invité'} à rejoindre le portail LaserNet en tant qu'<strong>administrateur</strong>.</p>
      <p>Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et activer votre compte :</p>
      <p style="text-align: center;">
        <a href="${opts.inviteUrl}" class="cta-button">Activer mon compte</a>
      </p>
      <p style="font-size: 13px; color: #666;">Ce lien expire dans 48 heures.</p>
      <p style="font-size: 12px; color: #888;">Si le bouton ne fonctionne pas, copiez-collez ce lien :</p>
      <p class="url-fallback">${escapeHtml(opts.inviteUrl)}</p>
    `;

    await ctx.transporter.sendMail({
      from: ctx.from,
      to: opts.to,
      subject: 'Invitation administrateur — Portail LaserNet',
      html: wrapHtml('Invitation administrateur', body),
    });
    return true;
  } catch (err) {
    console.error('[email] sendAdminInviteEmail failed:', err);
    return false;
  }
}

// ---------- Password reset ----------
export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
  resetBy?: string | null;
}): Promise<boolean> {
  try {
    const ctx = await getTransporter();
    if (!ctx) return false;

    const body = `
      <p>Bonjour <strong>${escapeHtml(opts.name)}</strong>,</p>
      <p>${opts.resetBy ? `<strong>${escapeHtml(opts.resetBy)}</strong> a initié` : 'Une demande a été initiée pour'} la réinitialisation du mot de passe de votre compte administrateur.</p>
      <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
      <p style="text-align: center;">
        <a href="${opts.resetUrl}" class="cta-button">Réinitialiser mon mot de passe</a>
      </p>
      <p style="font-size: 13px; color: #666;">Ce lien expire dans 48 heures. Votre ancien mot de passe reste valide tant que vous n'en créez pas un nouveau.</p>
      <p style="font-size: 13px; color: #b91c1c;">Si vous n'êtes pas à l'origine de cette demande, ignorez ce courriel et prévenez l'équipe.</p>
      <p style="font-size: 12px; color: #888;">Lien direct :</p>
      <p class="url-fallback">${escapeHtml(opts.resetUrl)}</p>
    `;

    await ctx.transporter.sendMail({
      from: ctx.from,
      to: opts.to,
      subject: 'Réinitialisation du mot de passe — Portail LaserNet',
      html: wrapHtml('Réinitialisation du mot de passe', body),
    });
    return true;
  } catch (err) {
    console.error('[email] sendPasswordResetEmail failed:', err);
    return false;
  }
}
