// ============================================================
// i18n — `forgot` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================


  // ============================================================
  // FORGOT PASSWORD PAGE
  // ============================================================
export const forgot = {
  title: { fr: 'Mot de passe oublié', en: 'Forgot password' },
  subtitle: { fr: 'Entrez votre courriel et nous vous enverrons un lien pour le réinitialiser.', en: 'Enter your email and we\'ll send you a link to reset it.' },
  sendReset: { fr: 'Envoyer le lien', en: 'Send reset link' },
  sending: { fr: 'Envoi...', en: 'Sending...' },
  emailRequired: { fr: 'Veuillez entrer votre courriel.', en: 'Please enter your email.' },
  somethingWentWrong: { fr: 'Une erreur est survenue. Réessayez.', en: 'Something went wrong. Please try again.' },
  checkInboxTitle: { fr: 'Vérifiez votre courriel', en: 'Check your inbox' },
  checkInboxBody: { fr: 'Si un compte correspond à ce courriel, un lien de réinitialisation vient d\'être envoyé. Le lien expire dans 1 heure.', en: 'If an account matches that email, a reset link was just sent. The link expires in 1 hour.' },
  backToLogin: { fr: 'Retour à la connexion', en: 'Back to login' },
} as const;
