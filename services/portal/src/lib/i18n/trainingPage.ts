// ============================================================
// i18n — `trainingPage` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================


  // ============================================================
  // TRAINING PAGE
  // ============================================================
export const trainingPage = {
  title: { fr: 'Agenda de formation', en: 'Training Agenda' },
  newEvent: { fr: '+ Nouvel événement de formation', en: '+ New Training Event' },
  upcoming: { fr: 'À venir', en: 'Upcoming' },
  pastCompleted: { fr: 'Passé / Terminé', en: 'Past / Completed' },
  noUpcoming: { fr: 'Aucune formation à venir', en: 'No upcoming trainings' },
  newTrainingEvent: { fr: 'Nouvel événement de formation', en: 'New Training Event' },
  titleLabel: { fr: 'Titre', en: 'Title' },
  descriptionLabel: { fr: 'Description', en: 'Description' },
  dateLabel: { fr: 'Date', en: 'Date' },
  templateOptional: { fr: 'Gabarit (optionnel)', en: 'Template (optional)' },
  noTemplateOption: { fr: 'Aucun gabarit', en: 'No template' },
  attendeesLabel: { fr: 'Participants', en: 'Attendees' },
  searchContacts: { fr: 'Rechercher des contacts par nom, courriel ou entreprise...', en: 'Search contacts by name, email, or company...' },
  createEvent: { fr: 'Créer l\'événement', en: 'Create Event' },
  markComplete: { fr: 'Marquer comme terminé', en: 'Mark Complete' },
  noAttendees: { fr: 'Aucun participant assigné', en: 'No attendees assigned' },
  confirmed: { fr: 'Confirmé', en: 'Confirmed' },
  invited: { fr: 'Invité', en: 'Invited' },
  pending: { fr: 'En attente', en: 'Pending' },
  attachFile: { fr: 'Joindre un fichier', en: 'Attach file' },
  selectOrCreate: { fr: 'Sélectionnez un événement de formation ou créez-en un nouveau', en: 'Select a training event or create a new one' },
  // Statuses
  scheduled: { fr: 'Planifié', en: 'scheduled' },
  completed: { fr: 'Terminé', en: 'completed' },
  cancelled: { fr: 'Annulé', en: 'cancelled' },
  trainingDetails: { fr: 'Détails de la formation', en: 'Training details...' },
  cobotSafetyExample: { fr: 'ex. Formation sécurité Cobot - Printemps 2026', en: 'e.g. Cobot Safety Training - Spring 2026' },
} as const;
