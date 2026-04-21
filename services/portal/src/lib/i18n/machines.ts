// ============================================================
// i18n — `machines` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================


  // ============================================================
  // MACHINES PAGE
  // ============================================================
export const machines = {
  title: { fr: 'Machines', en: 'Machines' },
  subtitle: { fr: 'Gérer toutes les machines physiques (robots et lasers)', en: 'Manage all physical machines (robots and lasers)' },
  newMachine: { fr: 'Nouvelle machine', en: 'New Machine' },
  machineDetails: { fr: 'Détails de la machine', en: 'Machine Details' },
  openRobotSoftware: { fr: 'Ouvrir le logiciel du robot', en: 'Open robot software' },
  openLaserSoftware: { fr: 'Ouvrir le logiciel du laser', en: 'Open laser software' },
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
} as const;
