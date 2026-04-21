// ============================================================
// i18n — `nav` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================


  // ============================================================
  // SIDEBAR / NAVIGATION
  // ============================================================
export const nav = {
  dashboard: { fr: 'Tableau de bord', en: 'Dashboard' },
  clients: { fr: 'Clients', en: 'Clients' },
  stations: { fr: 'Stations', en: 'Stations' },
  machines: { fr: 'Machines', en: 'Machines' },
  stationPCs: { fr: 'PC de station', en: 'Station PCs' },
  training: { fr: 'Formation', en: 'Training' },
  tickets: { fr: 'Billets', en: 'Tickets' },
  files: { fr: 'Fichiers', en: 'Files' },
  settings: { fr: 'Paramètres', en: 'Settings' },
  videos: { fr: 'Vidéos', en: 'Videos' },
  invoices: { fr: 'Factures', en: 'Invoices' },
  leads: { fr: 'Prospects', en: 'Prospects' },
  liveVisits: { fr: 'Visites', en: 'Visits' },
  businesses: { fr: 'Entreprises', en: 'Businesses' },
  onboarding: { fr: 'Intégration', en: 'Onboarding' },
  integration: { fr: 'Intégration', en: 'Integration' },
  followUp: { fr: 'Suivi', en: 'Follow-up' },
  search: { fr: 'Recherche', en: 'Search' },
  accounting: { fr: 'Comptabilité', en: 'Accounting' },
  quotes: { fr: 'Soumissions', en: 'Quotes' },
  inventory: { fr: 'Inventaire', en: 'Inventory' },
  people: { fr: 'Personnes', en: 'People' },
  projects: { fr: 'Projets', en: 'Projects' },
  signOut: { fr: 'Déconnexion', en: 'Sign Out' },
  signingOut: { fr: 'Déconnexion...', en: 'Signing out...' },
  adminPortal: { fr: 'Portail Admin', en: 'Admin Portal' },
  clientPortal: { fr: 'Portail Client', en: 'Client Portal' },
  reorderSidebar: { fr: 'Réorganiser le menu', en: 'Reorder sidebar' },
  reorderTitle: { fr: 'Réorganiser le menu', en: 'Reorder Sidebar' },
  reorderDone: { fr: 'Terminé', en: 'Done' },
  reorderReset: { fr: 'Réinitialiser', en: 'Reset' },
  reorderHint: { fr: 'Glissez pour réorganiser', en: 'Drag to reorder' },
  // QuickBooksStatus chip
  clientDataServer: { fr: 'Serveur de données clients', en: 'Client data server' },
  clientDataServerTitle: { fr: 'Aller à la connexion du serveur de données clients', en: 'Go to client data server connection' },
  qbChecking: { fr: 'Vérification…', en: 'Checking…' },
  qbConnected: { fr: 'Connecté', en: 'Connected' },
  qbDisconnected: { fr: 'Non connecté', en: 'Not connected' },
  qbNotConfigured: { fr: 'Non configuré', en: 'Not configured' },
  qbUnavailable: { fr: 'Indisponible', en: 'Unavailable' },
  qbConnectAction: { fr: 'Connecter', en: 'Connect' },
} as const;
