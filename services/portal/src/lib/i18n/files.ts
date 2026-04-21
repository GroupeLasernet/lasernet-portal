// ============================================================
// i18n — `files` namespace (French default, English fallback).
// Auto-split from the former monolithic src/lib/translations.ts.
// Merge back in src/lib/i18n/index.ts.
// ============================================================


  // ============================================================
  // FILES PAGE
  // ============================================================
export const files = {
  title: { fr: 'Fichiers et médias', en: 'Files & Media' },
  subtitle: { fr: 'Gérer les fichiers et vidéos partagés avec les clients', en: 'Manage files and videos shared with clients' },
  documents: { fr: 'Documents', en: 'Documents' },
  videos: { fr: 'Vidéos', en: 'Videos' },
  uploadFile: { fr: 'Téléverser un fichier', en: 'Upload File' },
  fileName: { fr: 'Nom du fichier', en: 'File Name' },
  category: { fr: 'Catégorie', en: 'Category' },
  uploaded: { fr: 'Téléversé', en: 'Uploaded' },
  // Added 2026-04-20 — real edit/delete/upload on /admin/files
  addVideo: { fr: 'Ajouter une vidéo Vimeo', en: 'Add a Vimeo video' },
  noDocuments: { fr: 'Aucun document. Téléversez-en un pour commencer.', en: 'No documents yet. Upload one to get started.' },
  noVideos: { fr: 'Aucune vidéo. Ajoutez un lien Vimeo pour commencer.', en: 'No videos yet. Add a Vimeo link to get started.' },
  editDocument: { fr: 'Modifier le document', en: 'Edit document' },
  editVideo: { fr: 'Modifier la vidéo', en: 'Edit video' },
  confirmDeleteDoc: { fr: 'Supprimer ce document définitivement ?', en: 'Delete this document permanently?' },
  confirmDeleteVideo: { fr: 'Retirer ce lien vidéo ?', en: 'Remove this video link?' },
  scope: { fr: 'Portée', en: 'Scope' },
  scopeInternal: { fr: 'Interne (équipe)', en: 'Internal (team)' },
  scopeClient: { fr: 'Lié à un client', en: 'Linked to a client' },
  subCategory: { fr: 'Sous-catégorie', en: 'Sub-category' },
  title_label: { fr: 'Titre', en: 'Title' },
  vimeoUrl: { fr: 'Lien Vimeo', en: 'Vimeo URL' },
  description: { fr: 'Description', en: 'Description' },
  save: { fr: 'Enregistrer', en: 'Save' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  download: { fr: 'Télécharger', en: 'Download' },
  linkedTo: { fr: 'Lié à', en: 'Linked to' },
  business: { fr: 'Entreprise', en: 'Business' },
  chooseFile: { fr: 'Choisir un fichier', en: 'Choose a file' },
  linkedSkus: { fr: 'Articles liés (SKU)', en: 'Linked SKUs' },
  relatedFiles: { fr: 'Fichiers liés', en: 'Related files' },
  // Added 2026-04-21 — per-container kebab menu + sort options
  menuLabel: { fr: 'Options du conteneur', en: 'Container options' },
  sortByNameAsc: { fr: 'Trier par nom (A→Z)', en: 'Sort by name (A→Z)' },
  sortByNameDesc: { fr: 'Trier par nom (Z→A)', en: 'Sort by name (Z→A)' },
  sortByNewest: { fr: 'Plus récents d’abord', en: 'Newest first' },
  sortByOldest: { fr: 'Plus anciens d’abord', en: 'Oldest first' },
  sortByLargest: { fr: 'Plus volumineux d’abord', en: 'Largest first' },
  menuUpload: { fr: 'Téléverser dans ce conteneur', en: 'Upload into this container' },
  menuAddVideo: { fr: 'Ajouter une vidéo Vimeo', en: 'Add a Vimeo video' },
} as const;
