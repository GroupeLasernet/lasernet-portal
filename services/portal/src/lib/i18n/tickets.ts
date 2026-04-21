// ============================================================
// i18n — `tickets` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================


  // ============================================================
  // TICKETS PAGE
  // ============================================================
export const tickets = {
  title: { fr: 'Billets de support', en: 'Support Tickets' },
  statusFilter: { fr: 'Statut', en: 'Status' },
  priorityFilter: { fr: 'Priorité', en: 'Priority' },
  allStatuses: { fr: 'Tous les statuts', en: 'All Statuses' },
  open: { fr: 'Ouvert', en: 'Open' },
  inProgress: { fr: 'En cours', en: 'In Progress' },
  waiting: { fr: 'En attente', en: 'Waiting' },
  resolved: { fr: 'Résolu', en: 'Resolved' },
  closed: { fr: 'Fermé', en: 'Closed' },
  allPriorities: { fr: 'Toutes les priorités', en: 'All Priorities' },
  critical: { fr: 'Critique', en: 'Critical' },
  high: { fr: 'Haute', en: 'High' },
  medium: { fr: 'Moyenne', en: 'Medium' },
  low: { fr: 'Basse', en: 'Low' },
  ticketDetails: { fr: 'Détails du billet', en: 'Ticket Details' },
  clientCompany: { fr: 'Entreprise du client', en: 'Client Company' },
  createdBy: { fr: 'Créé par', en: 'Created By' },
  subject: { fr: 'Sujet', en: 'Subject' },
  attachments: { fr: 'Pièces jointes', en: 'Attachments' },
  linkInvoice: { fr: 'Lier une facture', en: 'Link Invoice' },
  linked: { fr: 'Liée :', en: 'Linked:' },
  selectInvoice: { fr: 'Sélectionner une facture', en: 'Select Invoice' },
  link: { fr: 'Lier', en: 'Link' },
  updateStatus: { fr: 'Mettre à jour le statut', en: 'Update Status' },
  moveTo: { fr: 'Passer à', en: 'Move to' },
  ticketClosed: { fr: 'Ce billet est fermé', en: 'This ticket is closed' },
  noTickets: { fr: 'Aucun billet trouvé', en: 'No tickets found' },
  totalTickets: { fr: 'Total :', en: 'Total:' },
  created: { fr: 'Créé :', en: 'Created:' },
  updated: { fr: 'Modifié :', en: 'Updated:' },
} as const;
