// ============================================================
// TRANSLATIONS — French (default) and English
// ============================================================

export type Language = 'fr' | 'en';

const translations = {
  // ============================================================
  // COMMON / SHARED
  // ============================================================
  common: {
    save: { fr: 'Enregistrer', en: 'Save' },
    cancel: { fr: 'Annuler', en: 'Cancel' },
    delete: { fr: 'Supprimer', en: 'Delete' },
    edit: { fr: 'Modifier', en: 'Edit' },
    close: { fr: 'Fermer', en: 'Close' },
    create: { fr: 'Créer', en: 'Create' },
    add: { fr: 'Ajouter', en: 'Add' },
    remove: { fr: 'Retirer', en: 'Remove' },
    search: { fr: 'Rechercher', en: 'Search' },
    loading: { fr: 'Chargement...', en: 'Loading...' },
    yes: { fr: 'Oui', en: 'Yes' },
    no: { fr: 'Non', en: 'No' },
    confirm: { fr: 'Confirmer', en: 'Confirm' },
    back: { fr: 'Retour', en: 'Back' },
    next: { fr: 'Suivant', en: 'Next' },
    upload: { fr: 'Téléverser', en: 'Upload' },
    uploading: { fr: 'Téléversement...', en: 'Uploading...' },
    download: { fr: 'Télécharger', en: 'Download' },
    noResults: { fr: 'Aucun résultat', en: 'No results' },
    actions: { fr: 'Actions', en: 'Actions' },
    status: { fr: 'Statut', en: 'Status' },
    date: { fr: 'Date', en: 'Date' },
    name: { fr: 'Nom', en: 'Name' },
    email: { fr: 'Courriel', en: 'Email' },
    phone: { fr: 'Téléphone', en: 'Phone' },
    role: { fr: 'Rôle', en: 'Role' },
    description: { fr: 'Description', en: 'Description' },
    title: { fr: 'Titre', en: 'Title' },
    type: { fr: 'Type', en: 'Type' },
    size: { fr: 'Taille', en: 'Size' },
    all: { fr: 'Tous', en: 'All' },
    holdConfirm: { fr: 'Oui (maintenir 2s)', en: 'Yes (hold 2s)' },
    holding: { fr: 'Maintenir...', en: 'Hold...' },
    areYouSure: { fr: 'Êtes-vous sûr ?', en: 'Are you sure?' },
    saved: { fr: 'Enregistré !', en: 'Saved!' },
    optional: { fr: 'Optionnel', en: 'Optional' },
    required: { fr: 'Requis', en: 'Required' },
  },

  // ============================================================
  // SIDEBAR / NAVIGATION
  // ============================================================
  nav: {
    dashboard: { fr: 'Tableau de bord', en: 'Dashboard' },
    clients: { fr: 'Clients', en: 'Clients' },
    stations: { fr: 'Stations', en: 'Stations' },
    machines: { fr: 'Machines', en: 'Machines' },
    training: { fr: 'Formation', en: 'Training' },
    tickets: { fr: 'Billets', en: 'Tickets' },
    files: { fr: 'Fichiers', en: 'Files' },
    settings: { fr: 'Paramètres', en: 'Settings' },
    videos: { fr: 'Vidéos', en: 'Videos' },
    invoices: { fr: 'Factures', en: 'Invoices' },
    signOut: { fr: 'Déconnexion', en: 'Sign Out' },
    signingOut: { fr: 'Déconnexion...', en: 'Signing out...' },
    adminPortal: { fr: 'Portail Admin', en: 'Admin Portal' },
    clientPortal: { fr: 'Portail Client', en: 'Client Portal' },
  },

  // ============================================================
  // LOGIN PAGE
  // ============================================================
  login: {
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
  },

  // ============================================================
  // DASHBOARD
  // ============================================================
  dashboard: {
    title: { fr: 'Tableau de bord administrateur', en: 'Admin Dashboard' },
    subtitle: { fr: 'Aperçu de votre entreprise LaserNet', en: 'Overview of your LaserNet business' },
    comingSoon: { fr: 'Contenu du tableau de bord à venir.', en: 'Dashboard content coming soon.' },
  },

  // ============================================================
  // CLIENTS PAGE
  // ============================================================
  clients: {
    title: { fr: 'Clients', en: 'Clients' },
    subtitle: { fr: 'Importez des clients depuis QuickBooks et gérez leurs contacts', en: 'Import clients from QuickBooks and manage their contacts' },
    // QuickBooks section
    qbClients: { fr: 'Clients QuickBooks', en: 'QuickBooks Clients' },
    connect: { fr: 'Connecter', en: 'Connect' },
    reconnect: { fr: 'Reconnecter', en: 'Reconnect' },
    connected: { fr: 'Connecté — affichage des données QuickBooks en direct', en: 'Connected — showing live QuickBooks data' },
    demoData: { fr: 'Données de démonstration — connectez QuickBooks pour des vrais clients', en: 'Showing demo data — connect QuickBooks for real clients' },
    sessionExpired: { fr: 'Session QuickBooks expirée — cliquez Reconnecter', en: 'QuickBooks session expired — click Reconnect' },
    searchQB: { fr: 'Rechercher des clients QuickBooks...', en: 'Search QuickBooks clients...' },
    noMatchingClients: { fr: 'Aucun client correspondant', en: 'No matching clients' },
    credentialsMissing: { fr: 'Les identifiants QuickBooks sont manquants. Ajoutez QUICKBOOKS_CLIENT_ID et QUICKBOOKS_CLIENT_SECRET dans Vercel, puis redéployez.', en: 'QuickBooks credentials are missing. Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in Vercel, then redeploy.' },
    // Enrolment
    enrolment: { fr: 'Inscription', en: 'Enrolment' },
    noClientsEnrolled: { fr: 'Aucun client inscrit', en: 'No clients enrolled yet' },
    searchQBAbove: { fr: 'Recherchez dans QuickBooks ci-dessus pour ajouter des clients', en: 'Search QuickBooks above to add clients' },
    clientsEnrolled: { fr: 'client(s) inscrit(s)', en: 'client(s) enrolled' },
    // Right panel
    selectClient: { fr: 'Sélectionnez un client à gérer', en: 'Select a client from Enrolment to manage' },
    removeClient: { fr: 'Retirer', en: 'Remove' },
    streetView: { fr: 'Vue de la rue', en: 'Street View' },
    // Main Contact
    mainContact: { fr: 'Contact principal', en: 'Main Contact' },
    setMainContact: { fr: '+ Définir le contact principal', en: '+ Set Main Contact' },
    editMainContact: { fr: 'Modifier le contact principal', en: 'Edit Main Contact' },
    noMainContact: { fr: 'Aucun contact principal assigné', en: 'No main contact assigned yet' },
    removeMainContact: { fr: 'Retirer le contact principal ?', en: 'Remove the main contact?' },
    // Staff
    staff: { fr: 'Personnel', en: 'Staff' },
    addStaff: { fr: '+ Ajouter du personnel', en: '+ Add Staff' },
    editStaff: { fr: 'Modifier le membre du personnel', en: 'Edit Staff Member' },
    addStaffMember: { fr: 'Ajouter un membre du personnel', en: 'Add Staff Member' },
    noStaff: { fr: 'Aucun membre du personnel ajouté', en: 'No staff members added yet' },
    removeStaff: { fr: 'Retirer ce membre du personnel ?', en: 'Remove this staff member?' },
    mainContactDesc: { fr: 'La personne contact principale pour ce client', en: 'The main contact person for this client' },
    staffDesc: { fr: 'Un membre du personnel de l\'entreprise de ce client', en: 'A staff member at this client\'s company' },
    // Contact form
    fullName: { fr: 'Nom complet *', en: 'Full Name *' },
    emailRequired: { fr: 'Courriel *', en: 'Email *' },
    phoneLabel: { fr: 'Téléphone', en: 'Phone' },
    roleLabel: { fr: 'Rôle', en: 'Role' },
    profilePhoto: { fr: 'Photo de profil', en: 'Profile Photo' },
    clickAvatar: { fr: 'Cliquez sur l\'avatar pour téléverser une photo', en: 'Click the avatar to upload a photo' },
    leaveEmptyInitials: { fr: 'Ou laissez vide pour les initiales automatiques', en: 'Or leave empty for auto-generated initials' },
    profileQRCode: { fr: 'Code QR du profil', en: 'Profile QR Code' },
    scanToEdit: { fr: 'Numérisez pour ouvrir la page de modification du profil.', en: 'Scan to open self-edit profile page.' },
    sendTo: { fr: 'Envoyer à', en: 'Send to' },
    passwordSection: { fr: 'Mot de passe', en: 'Password' },
    sendResetEmail: { fr: 'Envoyer un courriel de réinitialisation à ce contact', en: 'Send a password reset email to this contact' },
    resetPassword: { fr: 'Réinitialiser le mot de passe', en: 'Reset Password' },
    resetSending: { fr: 'Envoi...', en: 'Sending...' },
    waitSeconds: { fr: 'Attendre', en: 'Wait' },
    resetSent: { fr: 'Courriel de réinitialisation envoyé à', en: 'Reset email sent to' },
    saveChanges: { fr: 'Enregistrer les modifications', en: 'Save Changes' },
    setAsMainContact: { fr: 'Définir comme contact principal', en: 'Set as Main Contact' },
    emailAlreadyUsed: { fr: 'Ce courriel est déjà assigné à', en: 'This email is already assigned to' },
    // Reassignment
    reassignSection: { fr: 'Réaffecter à un autre client', en: 'Reassign to another client' },
    reassignDesc: { fr: 'Déplacer ce contact vers un autre client géré', en: 'Move this contact to another managed client' },
    reassignKeep: { fr: '— Garder le client actuel —', en: '— Keep current client —' },
    // Training/Booklet columns
    trainingCol: { fr: 'Formation', en: 'Training' },
    bookletCol: { fr: 'Livret', en: 'Booklet' },
    // Invoices
    invoices: { fr: 'Factures', en: 'Invoices' },
    invoiceNumber: { fr: 'Facture #', en: 'Invoice #' },
    clickInvoice: { fr: 'Cliquez sur une facture pour créer des Stations', en: 'Click an invoice to create Stations' },
    noInvoices: { fr: 'Aucune facture trouvée pour ce client', en: 'No invoices found for this client' },
    loadingInvoices: { fr: 'Chargement des factures...', en: 'Loading invoices...' },
    items: { fr: 'Articles', en: 'Items' },
    // Stations
    stationsSection: { fr: 'Stations', en: 'Stations' },
    noStations: { fr: 'Aucune station créée', en: 'No stations created yet' },
    clickInvoiceStations: { fr: 'Cliquez sur une facture ci-dessus pour sélectionner des articles et créer des stations', en: 'Click an invoice above to select line items and create stations' },
    deleteStation: { fr: 'Supprimer cette station ?', en: 'Delete this station?' },
    fromInvoice: { fr: 'De la facture', en: 'From invoice' },
    // Station creation modal
    lineItems: { fr: 'Articles de la facture', en: 'Line Items' },
    selectItems: { fr: 'Sélectionnez les articles à assigner à une Station', en: 'Select the items you want to assign to a Station' },
    model: { fr: 'Modèle', en: 'Model' },
    stationsCreated: { fr: 'Stations créées', en: 'Stations Created' },
    stationsAvailable: { fr: 'Stations disponibles', en: 'Stations Available' },
    howManyStations: { fr: 'Combien de stations pour cet article ?', en: 'How many stations for this item?' },
    addToExisting: { fr: 'Ajouter à une station existante', en: 'Add to existing station' },
    createNewStation: { fr: 'Créer une nouvelle station', en: 'Create new station' },
    stationName: { fr: 'Nom de la station', en: 'Station name' },
    stationNameDefault: { fr: 'Nom de la station (défaut : Station —', en: 'Station name (default: Station —' },
    itemsSelected: { fr: 'article(s) sélectionné(s)', en: 'item(s) selected' },
    selectLineItems: { fr: 'Sélectionnez les articles ci-dessus pour créer une Station', en: 'Select line items above to create a Station' },
    addToStation: { fr: 'Ajouter à la Station', en: 'Add to Station' },
    createStation: { fr: 'Créer la Station', en: 'Create Station' },
    // Training Agenda
    trainingAgenda: { fr: 'Agenda de formation', en: 'Training Agenda' },
    newTraining: { fr: 'Nouvelle formation', en: 'New Training' },
    noTrainings: { fr: 'Aucune formation', en: 'No trainings yet' },
    clickNewTraining: { fr: 'Cliquez + Nouvelle formation pour en planifier une', en: 'Click + New Training to schedule one' },
    deleteTraining: { fr: 'Supprimer cette formation ?', en: 'Delete this training?' },
    attendees: { fr: 'Participants', en: 'Attendees' },
    attendeesCount: { fr: 'participant(s)', en: 'attendee(s)' },
    template: { fr: 'Gabarit', en: 'Template' },
    // Training form
    trainingTemplate: { fr: 'Gabarit de formation', en: 'Training Template' },
    noTemplate: { fr: '— Aucun gabarit —', en: '— No template —' },
    noTemplatesWarning: { fr: 'Aucun gabarit trouvé. Créez des gabarits dans Paramètres > Gabarits de formation.', en: 'No templates found. Create templates in Settings > Training Templates before adding.' },
    titleRequired: { fr: 'Titre *', en: 'Title *' },
    dateRequired: { fr: 'Date *', en: 'Date *' },
    durationMin: { fr: 'Durée (min)', en: 'Duration (min)' },
    addStaffFrom: { fr: 'Ajoutez du personnel de', en: 'Add staff from' },
    noContactsToAdd: { fr: 'Aucun contact à ajouter. Ajoutez d\'abord du personnel ou un contact principal.', en: 'No contacts to add. Add staff or a main contact first.' },
    attendeesSelected: { fr: 'participant(s) sélectionné(s)', en: 'attendee(s) selected' },
    filesSection: { fr: 'Fichiers', en: 'Files' },
    attachBooklet: { fr: 'Joindre des photos de livret, documents ou vidéos', en: 'Attach training booklet photos, documents, or videos' },
    uploadFiles: { fr: 'Téléverser des fichiers', en: 'Upload Files' },
    createTraining: { fr: 'Créer la formation', en: 'Create Training' },
    creating: { fr: 'Création...', en: 'Creating...' },
    forCompany: { fr: 'Pour', en: 'For' },
    min: { fr: 'min', en: 'min' },
  },

  // ============================================================
  // STATIONS / JOBS PAGE
  // ============================================================
  stations: {
    title: { fr: 'Stations', en: 'Stations' },
    newStation: { fr: 'Nouvelle Station', en: 'New Station' },
    stationInfo: { fr: 'Info Station', en: 'Station Info' },
    machinesSection: { fr: 'Machines', en: 'Machines' },
    robotStatus: { fr: 'Statut du robot', en: 'Robot Status' },
    laserStatus: { fr: 'Statut du laser', en: 'Laser Status' },
    addMachine: { fr: 'Ajouter une machine', en: 'Add Machine' },
    linkInvoice: { fr: 'Lier une facture', en: 'Link Invoice' },
    linkedInvoices: { fr: 'Factures liées', en: 'Linked Invoice/Invoices' },
    stationNameLabel: { fr: 'Nom de la station', en: 'Station Name' },
    statusLabel: { fr: 'Statut', en: 'Status' },
    clientLabel: { fr: 'Client', en: 'Client' },
    descriptionLabel: { fr: 'Description', en: 'Description' },
    machineType: { fr: 'Type de machine', en: 'Machine Type' },
    serialNumber: { fr: 'Numéro de série', en: 'Serial Number' },
    selectType: { fr: 'Sélectionner le type...', en: 'Select type...' },
    cobot: { fr: 'Cobot', en: 'Cobot' },
    laserMachine: { fr: 'Machine laser', en: 'Laser Machine' },
    enterSerial: { fr: 'Entrez le numéro de série...', en: 'Enter serial number...' },
    noMachines: { fr: 'Aucune machine (aucun article de facture lié)', en: 'No machines (no invoice items linked)' },
    noRobotStatus: { fr: 'Aucune entrée de statut robot', en: 'No robot status entries' },
    noLaserStatus: { fr: 'Aucune entrée de statut laser', en: 'No laser status entries' },
    noStationsMatch: { fr: 'Aucune station ne correspond à votre recherche', en: 'No stations match your search' },
    noStationsYet: { fr: 'Aucune station', en: 'No stations yet' },
    selectStation: { fr: 'Sélectionnez une station pour voir les détails', en: 'Select a station to view details' },
    noMachinesAvailable: { fr: 'Toutes les machines sont déjà assignées', en: 'All machines are already assigned' },
    noInvoicesAvailable: { fr: 'Aucune facture disponible', en: 'No available invoices' },
    deleteStationConfirm: { fr: 'Supprimer cette station ?', en: 'Delete this station?' },
    searchStations: { fr: 'Rechercher par nom d\'entreprise...', en: 'Search by business name...' },
    allStatuses: { fr: 'Tous les statuts', en: 'All Statuses' },
    selectClient: { fr: 'Sélectionner un client', en: 'Select a client' },
    titleRequired: { fr: 'Titre *', en: 'Title *' },
    notes: { fr: 'Notes', en: 'Notes' },
    clientRequired: { fr: 'Client et titre requis', en: 'Client and title are required' },
    // Status options
    notConfigured: { fr: 'Pas entièrement configuré', en: 'Not fully configured' },
    waitingPairing: { fr: 'Configuré / En attente du premier jumelage', en: 'Configured / Waiting for first pairing' },
    inTrouble: { fr: 'En difficulté', en: 'In trouble' },
    active: { fr: 'Actif / En fonction', en: 'Working / Active' },
  },

  // ============================================================
  // MACHINES PAGE
  // ============================================================
  machines: {
    title: { fr: 'Machines', en: 'Machines' },
    subtitle: { fr: 'Gérer toutes les machines physiques (robots et lasers)', en: 'Manage all physical machines (robots and lasers)' },
    newMachine: { fr: 'Nouvelle machine', en: 'New Machine' },
    machineDetails: { fr: 'Détails de la machine', en: 'Machine Details' },
    location: { fr: 'Emplacement', en: 'Location' },
    newLocation: { fr: 'Nouvel emplacement', en: 'New Location' },
    client: { fr: 'Client', en: 'Client' },
    invoice: { fr: 'Facture', en: 'Invoice' },
    eventHistory: { fr: 'Historique des événements', en: 'Event History' },
    linkedStations: { fr: 'Stations liées', en: 'Linked Stations' },
    sendToRepair: { fr: 'Envoyer en réparation', en: 'Send to Repair' },
    refund: { fr: 'Rembourser', en: 'Refund' },
    relocate: { fr: 'Relocaliser', en: 'Relocate' },
    reassign: { fr: 'Réassigner à un autre client', en: 'Reassign to Another Client' },
    reactivate: { fr: 'Réactiver', en: 'Reactivate' },
    selectNewClient: { fr: 'Sélectionner un nouveau client', en: 'Select New Client' },
    chooseClient: { fr: 'Choisir un client...', en: 'Choose a client...' },
    type: { fr: 'Type', en: 'Type' },
    // Filters
    allFilter: { fr: 'Tous', en: 'All' },
    robots: { fr: 'Robots', en: 'Robots' },
    lasers: { fr: 'Lasers', en: 'Lasers' },
    allStatus: { fr: 'Tous les statuts', en: 'All Status' },
    activeStatus: { fr: 'Actif', en: 'Active' },
    inRepair: { fr: 'En réparation', en: 'In Repair' },
    refunded: { fr: 'Remboursé', en: 'Refunded' },
    decommissioned: { fr: 'Décommissionné', en: 'Decommissioned' },
    listView: { fr: 'Liste', en: 'List' },
    mapView: { fr: 'Carte', en: 'Map' },
    // Form fields
    searchMachines: { fr: 'Rechercher par série, modèle ou client...', en: 'Search by serial, model, or client...' },
    address: { fr: 'Adresse', en: 'Address' },
    city: { fr: 'Ville', en: 'City' },
    province: { fr: 'Province', en: 'Province' },
    postalCode: { fr: 'Code postal', en: 'Postal Code' },
    country: { fr: 'Pays', en: 'Country' },
    serialNumberRequired: { fr: 'Numéro de série *', en: 'Serial Number *' },
    modelRequired: { fr: 'Modèle *', en: 'Model *' },
    nickname: { fr: 'Surnom (Optionnel)', en: 'Nickname (Optional)' },
    ipAddress: { fr: 'Adresse IP (Optionnel)', en: 'IP Address (Optional)' },
    clientOptional: { fr: 'Client (Optionnel)', en: 'Client (Optional)' },
    unassigned: { fr: 'Non assigné', en: 'Unassigned' },
    noMachinesFound: { fr: 'Aucune machine trouvée', en: 'No machines found' },
    noMachinesLocation: { fr: 'Aucune machine avec données d\'emplacement', en: 'No machines with location data' },
    softDeleteConfirm: { fr: 'Êtes-vous sûr ? Cela supprimera la machine.', en: 'Are you sure? This will soft-delete the machine.' },
  },

  // ============================================================
  // TRAINING PAGE
  // ============================================================
  trainingPage: {
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
  },

  // ============================================================
  // TICKETS PAGE
  // ============================================================
  tickets: {
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
  },

  // ============================================================
  // FILES PAGE
  // ============================================================
  files: {
    title: { fr: 'Fichiers et médias', en: 'Files & Media' },
    subtitle: { fr: 'Gérer les fichiers et vidéos partagés avec les clients', en: 'Manage files and videos shared with clients' },
    documents: { fr: 'Documents', en: 'Documents' },
    videos: { fr: 'Vidéos', en: 'Videos' },
    uploadFile: { fr: 'Téléverser un fichier', en: 'Upload File' },
    fileName: { fr: 'Nom du fichier', en: 'File Name' },
    category: { fr: 'Catégorie', en: 'Category' },
    uploaded: { fr: 'Téléversé', en: 'Uploaded' },
  },

  // ============================================================
  // SETTINGS PAGE
  // ============================================================
  settings: {
    title: { fr: 'Paramètres', en: 'Settings' },
    trainingTemplates: { fr: 'Gabarits de formation', en: 'Training Templates' },
    trainingTemplatesDesc: { fr: 'Créez des gabarits de formation réutilisables avec des fichiers pré-attachés', en: 'Create reusable training templates with pre-attached files' },
    newTemplate: { fr: '+ Nouveau gabarit', en: '+ New Template' },
    editTemplate: { fr: 'Modifier le gabarit', en: 'Edit Template' },
    newTemplateForm: { fr: 'Nouveau gabarit', en: 'New Template' },
    templateName: { fr: 'Nom du gabarit', en: 'Template name' },
    descriptionOptional: { fr: 'Description (optionnel)', en: 'Description (optional)' },
    createTemplate: { fr: 'Créer le gabarit', en: 'Create Template' },
    noTemplates: { fr: 'Aucun gabarit. Créez-en un pour commencer.', en: 'No templates yet. Create one to get started.' },
    files: { fr: 'fichier(s)', en: 'file(s)' },
    events: { fr: 'événement(s)', en: 'event(s)' },
    attachedFiles: { fr: 'Fichiers joints', en: 'Attached Files' },
    attachFile: { fr: 'Joindre un fichier', en: 'Attach file' },
    // Language
    languageSection: { fr: 'Langue', en: 'Language' },
    languageDesc: { fr: 'Choisissez votre langue préférée pour l\'interface', en: 'Choose your preferred interface language' },
    french: { fr: 'Français', en: 'French' },
    english: { fr: 'Anglais', en: 'English' },
    languageSaved: { fr: 'Langue enregistrée', en: 'Language saved' },
  },

  // ============================================================
  // EMAILS
  // ============================================================
  emails: {
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
  },
} as const;

// Helper type for nested keys
type TranslationSection = typeof translations;
type SectionKey = keyof TranslationSection;

// Get a translation value
export function t(section: SectionKey, key: string, lang: Language): string {
  const sectionObj = translations[section] as Record<string, Record<Language, string>>;
  if (!sectionObj || !sectionObj[key]) return key;
  return sectionObj[key][lang] || sectionObj[key]['en'] || key;
}

// Export the full translations object for direct access
export default translations;
