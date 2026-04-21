// ============================================================
// i18n — `login` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================


  // ============================================================
  // LOGIN PAGE
  // ============================================================
export const login = {
  signIn: { fr: 'Connexion', en: 'Sign In' },
  signingIn: { fr: 'Connexion...', en: 'Signing in...' },
  signInToPortal: { fr: 'Connectez-vous à votre portail', en: 'Sign in to your portal' },
  emailAddress: { fr: 'Adresse courriel', en: 'Email Address' },
  password: { fr: 'Mot de passe', en: 'Password' },
  loginFailed: { fr: 'Échec de connexion', en: 'Login failed' },
  somethingWentWrong: { fr: 'Une erreur est survenue. Veuillez réessayer.', en: 'Something went wrong. Please try again.' },
  invalidCredentials: { fr: 'Courriel ou mot de passe invalide', en: 'Invalid email or password' },
  demoAccounts: { fr: 'Comptes démo', en: 'Demo Accounts' },
  language: { fr: 'Langue', en: 'Language' },
  french: { fr: 'Français', en: 'French' },
  english: { fr: 'Anglais', en: 'English' },
  forgotPassword: { fr: 'Mot de passe oublié ?', en: 'Forgot your password?' },
} as const;
