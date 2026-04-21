// ============================================================
// i18n — `businesses` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================

  // ============================================================
  // BUSINESSES
  // ============================================================
export const businesses = {
  title: { fr: 'Entreprises', en: 'Businesses' },
  subtitle: { fr: 'Clients QuickBooks et entreprises locales', en: 'QuickBooks clients and local businesses' },
  newBusiness: { fr: 'Nouvelle entreprise', en: 'New Business' },
  searchPlaceholder: { fr: 'Rechercher par nom...', en: 'Search by name...' },
  noBusinesses: { fr: 'Aucune entreprise', en: 'No businesses yet' },
  selectBusiness: { fr: 'Selectionnez une entreprise pour voir les details', en: 'Select a business to view details' },
  editDetails: { fr: 'Modifier les details', en: 'Edit Details' },
  name: { fr: 'Nom', en: 'Name' },
  address: { fr: 'Adresse', en: 'Address' },
  city: { fr: 'Ville', en: 'City' },
  province: { fr: 'Province', en: 'Province' },
  postalCode: { fr: 'Code postal', en: 'Postal Code' },
  country: { fr: 'Pays', en: 'Country' },
  phone: { fr: 'Telephone', en: 'Phone' },
  email: { fr: 'Courriel', en: 'Email' },
  website: { fr: 'Site web', en: 'Website' },
  notes: { fr: 'Notes', en: 'Notes' },
  save: { fr: 'Enregistrer', en: 'Save' },
  saving: { fr: 'Enregistrement...', en: 'Saving...' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  create: { fr: 'Creer', en: 'Create' },
  visitHistory: { fr: 'Historique des visites', en: 'Visit History' },
  visits: { fr: 'Visites', en: 'Visits' },
  leads: { fr: 'Prospects', en: 'Prospects' },
  noVisits: { fr: 'Aucune visite enregistree', en: 'No visits recorded' },
  unknownVisitor: { fr: 'Visiteur inconnu', en: 'Unknown visitor' },
  files: { fr: 'Fichiers', en: 'Files' },
  noFiles: { fr: 'Aucun fichier', en: 'No files' },
  searchQb: { fr: 'Rechercher QB', en: 'Search QB' },
  linkToQb: { fr: 'Lier à un client QuickBooks', en: 'Link to QuickBooks client' },
  linkToQbTitle: { fr: 'Lier à QuickBooks', en: 'Link to QuickBooks' },
  linkToQbDesc: { fr: 'Recherchez un client QuickBooks pour le lier à cette entreprise locale. Les visites et prospects seront transférés.', en: 'Search for a QuickBooks customer to link to this local business. Visits and leads will be transferred.' },
  importFromQb: { fr: 'Importer depuis QuickBooks', en: 'Import from QuickBooks' },
  qbSearchPlaceholder: { fr: 'Tapez quelques lettres pour chercher...', en: 'Type a few letters to search...' },
  qbSearchHint: { fr: 'Recherchez un client par nom dans QuickBooks', en: 'Search for a customer by name in QuickBooks' },
  search: { fr: 'Chercher', en: 'Search' },
  link: { fr: 'Lier', en: 'Link' },
  import: { fr: 'Importer', en: 'Import' },
  businessInfo: { fr: 'Informations', en: 'Business Info' },
  qbReadOnly: { fr: 'Les informations QuickBooks sont en lecture seule. Modifiez-les dans QuickBooks.', en: 'QuickBooks info is read-only. Edit in QuickBooks.' },
} as const;
