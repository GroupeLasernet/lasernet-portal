// ============================================================
// i18n — `emails` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================


  // ============================================================
  // EMAILS
  // ============================================================
export const emails = {
  // Invite email
  inviteSubject: { fr: 'Vous avez été invité(e) au portail LaserNet', en: "You've been invited to LaserNet Portal" },
  inviteGreeting: { fr: 'Bonjour', en: 'Hi' },
  inviteBody: { fr: 'Vous avez été invité(e) à rejoindre le portail LaserNet.', en: "You've been invited to join the LaserNet Portal." },
  inviteButton: { fr: 'Configurer mon compte', en: 'Set Up My Account' },
  // Reset password email
  resetSubject: { fr: 'Réinitialisation de votre mot de passe — Atelier DSM', en: 'Reset Your Password — Atelier DSM' },
  resetGreeting: { fr: 'Bonjour', en: 'Hi' },
  resetBody: { fr: 'Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :', en: 'Click the link below to reset your password:' },
  resetButton: { fr: 'Réinitialiser le mot de passe', en: 'Reset Password' },
  // Training notification email
  trainingSubject: { fr: 'Formation planifiée :', en: 'Training Scheduled:' },
  trainingGreeting: { fr: 'Bonjour', en: 'Hi' },
  trainingScheduled: { fr: 'Vous avez été inscrit(e) à une session de formation :', en: 'You have been scheduled for a training session:' },
  trainingDate: { fr: 'Date :', en: 'Date:' },
  trainingCompany: { fr: 'Entreprise :', en: 'Company:' },
  // Profile link email
  profileSubject: { fr: 'Votre lien de profil — Atelier DSM', en: 'Your Profile Link — Atelier DSM' },
  profileBody: { fr: 'Voici votre lien de profil où vous pouvez mettre à jour vos informations :', en: 'Here is your profile link where you can update your information:' },
  profileRegards: { fr: 'Cordialement,', en: 'Best regards,' },
} as const;
