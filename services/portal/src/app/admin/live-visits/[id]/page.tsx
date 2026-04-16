'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

// ── Types ────────────────────────────────────────────────────────────────────

interface VisitLead {
  id: string;
  name: string;
  email: string | null;
  photo: string | null;
  company: string | null;
}

interface Visit {
  id: string;
  visitorName: string;
  visitorEmail: string | null;
  visitorPhone: string | null;
  visitorCompany: string | null;
  visitorPhoto: string | null;
  purpose: string | null;
  visitedAt: string;
  lead: VisitLead | null;
}

interface ManagedClient {
  id: string;
  displayName: string;
  companyName: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

interface LocalBusiness {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
}

interface VisitNeed {
  id: string;
  type: string;
  description: string | null;
  status: string;
  expectedDate: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface VisitFile {
  id: string;
  fileName: string;
  fileType: string;
  fileData: string;
  fileSize: number | null;
  notes: string | null;
  createdAt: string;
}

interface VisitGroup {
  id: string;
  status: string;
  notes: string | null;
  expectedFollowUpAt: string | null;
  mainContactId: string | null;
  managedClientId: string | null;
  localBusinessId: string | null;
  createdAt: string;
  completedAt: string | null;
  visits: Visit[];
  managedClient: ManagedClient | null;
  localBusiness: LocalBusiness | null;
  needs: VisitNeed[];
  files: VisitFile[];
  _count: { visits: number };
}

interface BusinessResult {
  id: string;
  name: string;
  type: 'managed' | 'local';
  address?: string | null;
  city?: string | null;
}

// ── Inline translations ─────────────────────────────────────────────────────

const lv: Record<string, { fr: string; en: string }> = {
  back: { fr: 'Retour aux visites', en: 'Back to visits' },
  loading: { fr: 'Chargement...', en: 'Loading...' },
  notFound: { fr: 'Visite non trouvée', en: 'Visit not found' },
  active: { fr: 'Active', en: 'Active' },
  completed: { fr: 'Terminée', en: 'Completed' },
  completeVisit: { fr: 'Terminer la visite', en: 'Complete Visit' },
  visitors: { fr: 'Visiteurs', en: 'Visitors' },
  mainContact: { fr: 'Contact principal', en: 'Main Contact' },
  setMainContact: { fr: 'Définir comme contact principal', en: 'Set as main contact' },
  business: { fr: 'Entreprise', en: 'Business' },
  noBusiness: { fr: 'Aucune entreprise liée', en: 'No business linked' },
  searchBusiness: { fr: 'Rechercher une entreprise...', en: 'Search business...' },
  linkBusiness: { fr: 'Lier', en: 'Link' },
  changeBusiness: { fr: 'Changer', en: 'Change' },
  createLocalBusiness: { fr: 'Créer une entreprise locale', en: 'Create local business' },
  managedClient: { fr: 'Client géré', en: 'Managed Client' },
  localBusiness: { fr: 'Entreprise locale', en: 'Local Business' },
  needs: { fr: 'Besoins de visite', en: 'Visit Needs' },
  addNeed: { fr: 'Ajouter un besoin', en: 'Add need' },
  needType: { fr: 'Type', en: 'Type' },
  needDescription: { fr: 'Description', en: 'Description' },
  needExpectedDate: { fr: 'Date prévue', en: 'Expected date' },
  needInfo: { fr: 'Information', en: 'Info' },
  needQuote: { fr: 'Soumission', en: 'Quote' },
  needManual: { fr: 'Manuel', en: 'Manual' },
  needPhotos: { fr: 'Photos', en: 'Photos' },
  needVideos: { fr: 'Vidéos', en: 'Videos' },
  needReports: { fr: 'Rapports', en: 'Reports' },
  needOther: { fr: 'Autre', en: 'Other' },
  pending: { fr: 'En attente', en: 'Pending' },
  inProgress: { fr: 'En cours', en: 'In Progress' },
  sent: { fr: 'Envoyé', en: 'Sent' },
  files: { fr: 'Fichiers', en: 'Files' },
  uploadFile: { fr: 'Téléverser', en: 'Upload' },
  takePhoto: { fr: 'Prendre une photo', en: 'Take Photo' },
  notes: { fr: 'Notes', en: 'Notes' },
  saveNotes: { fr: 'Enregistrer les notes', en: 'Save Notes' },
  followUp: { fr: 'Date de suivi', en: 'Follow-up Date' },
  noVisitors: { fr: 'Aucun visiteur', en: 'No visitors' },
  noNeeds: { fr: 'Aucun besoin enregistré', en: 'No needs recorded' },
  noFiles: { fr: 'Aucun fichier', en: 'No files' },
  address: { fr: 'Adresse', en: 'Address' },
  name: { fr: 'Nom', en: 'Name' },
  city: { fr: 'Ville', en: 'City' },
  province: { fr: 'Province', en: 'Province' },
  postalCode: { fr: 'Code postal', en: 'Postal Code' },
  phone: { fr: 'Téléphone', en: 'Phone' },
  email: { fr: 'Courriel', en: 'Email' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  create: { fr: 'Créer', en: 'Create' },
  save: { fr: 'Enregistrer', en: 'Save' },
  delete: { fr: 'Supprimer', en: 'Delete' },
  uploading: { fr: 'Téléversement...', en: 'Uploading...' },
  saving: { fr: 'Enregistrement...', en: 'Saving...' },
};

const NEED_TYPES = ['info', 'quote', 'manual', 'photos', 'videos', 'reports', 'other'] as const;
const NEED_STATUSES = ['pending', 'in_progress', 'sent', 'completed'] as const;

const NEED_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  sent: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function VisitGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();

  const tt = useCallback(
    (key: string) => {
      const entry = lv[key];
      if (!entry) return key;
      return entry[lang] ?? entry.en ?? key;
    },
    [lang],
  );

  // ── State ──
  const [group, setGroup] = useState<VisitGroup | null>(null);
  const [loading, setLoading] = useState(true);

  // Notes
  const [notesValue, setNotesValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // Follow-up
  const [followUp, setFollowUp] = useState('');

  // Business search
  const [showBusinessSearch, setShowBusinessSearch] = useState(false);
  const [businessQuery, setBusiness_query] = useState('');
  const [businessResults, setBusinessResults] = useState<BusinessResult[]>([]);
  const [businessSearching, setBusinessSearching] = useState(false);

  // Create local business form
  const [showCreateBiz, setShowCreateBiz] = useState(false);
  const [bizForm, setBizForm] = useState({ name: '', address: '', city: '', province: '', postalCode: '', phone: '', email: '' });
  const [bizCreating, setBizCreating] = useState(false);

  // Add need form
  const [showNeedForm, setShowNeedForm] = useState(false);
  const [needForm, setNeedForm] = useState({ type: 'info', description: '', expectedDate: '' });
  const [needSaving, setNeedSaving] = useState(false);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Camera
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Fetch ──
  const fetchGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/visit-groups/${id}`);
      const data = await res.json();
      if (data.visitGroup) {
        setGroup(data.visitGroup);
        setNotesValue(data.visitGroup.notes ?? '');
        setFollowUp(data.visitGroup.expectedFollowUpAt ? data.visitGroup.expectedFollowUpAt.slice(0, 10) : '');
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  // ── Patch visit group ──
  const patchGroup = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/visit-groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.visitGroup) {
        setGroup(data.visitGroup);
        setNotesValue(data.visitGroup.notes ?? '');
        setFollowUp(data.visitGroup.expectedFollowUpAt ? data.visitGroup.expectedFollowUpAt.slice(0, 10) : '');
      }
    } catch { /* silently fail */ }
  };

  // ── Complete visit ──
  const handleComplete = () => patchGroup({ status: 'completed' });

  // ── Main contact ──
  const handleSetMainContact = (leadId: string) => patchGroup({ mainContactId: leadId });

  // ── Save notes ──
  const handleSaveNotes = async () => {
    setNotesSaving(true);
    await patchGroup({ notes: notesValue });
    setNotesSaving(false);
  };

  // ── Follow-up date ──
  const handleFollowUpChange = (val: string) => {
    setFollowUp(val);
    patchGroup({ expectedFollowUpAt: val || null });
  };

  // ── Business search ──
  const searchBusinesses = async (q: string) => {
    setBusiness_query(q);
    if (!q.trim()) {
      setBusinessResults([]);
      return;
    }
    setBusinessSearching(true);
    try {
      const res = await fetch(`/api/kiosk/businesses?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setBusinessResults(data.businesses ?? []);
    } catch {
      setBusinessResults([]);
    }
    setBusinessSearching(false);
  };

  const handleLinkBusiness = async (biz: BusinessResult) => {
    if (biz.type === 'managed') {
      await patchGroup({ managedClientId: biz.id, localBusinessId: null });
    } else {
      await patchGroup({ localBusinessId: biz.id, managedClientId: null });
    }
    setShowBusinessSearch(false);
    setBusiness_query('');
    setBusinessResults([]);
  };

  // ── Create local business ──
  const handleCreateBiz = async () => {
    if (!bizForm.name.trim()) return;
    setBizCreating(true);
    try {
      const res = await fetch('/api/local-businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bizForm),
      });
      const data = await res.json();
      if (data.business) {
        await patchGroup({ localBusinessId: data.business.id, managedClientId: null });
        setShowCreateBiz(false);
        setBizForm({ name: '', address: '', city: '', province: '', postalCode: '', phone: '', email: '' });
      }
    } catch { /* silently fail */ }
    setBizCreating(false);
  };

  // ── Needs ──
  const handleAddNeed = async () => {
    if (!needForm.type) return;
    setNeedSaving(true);
    try {
      await fetch(`/api/visit-groups/${id}/needs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: needForm.type,
          description: needForm.description || null,
          expectedDate: needForm.expectedDate || null,
        }),
      });
      setShowNeedForm(false);
      setNeedForm({ type: 'info', description: '', expectedDate: '' });
      await fetchGroup();
    } catch { /* silently fail */ }
    setNeedSaving(false);
  };

  const handleNeedStatusChange = async (needId: string, status: string) => {
    try {
      await fetch(`/api/visit-groups/${id}/needs/${needId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await fetchGroup();
    } catch { /* silently fail */ }
  };

  const handleDeleteNeed = async (needId: string) => {
    try {
      await fetch(`/api/visit-groups/${id}/needs/${needId}`, { method: 'DELETE' });
      await fetchGroup();
    } catch { /* silently fail */ }
  };

  // ── Files ──
  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        await fetch(`/api/visit-groups/${id}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileData: base64,
            fileSize: file.size,
          }),
        });
        await fetchGroup();
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Camera ──
  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch { /* silently fail */ }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();

    // Upload captured photo
    setUploading(true);
    fetch(`/api/visit-groups/${id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: `photo_${Date.now()}.jpg`,
        fileType: 'image/jpeg',
        fileData: dataUrl,
        fileSize: Math.round(dataUrl.length * 0.75),
      }),
    })
      .then(() => fetchGroup())
      .finally(() => setUploading(false));
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  };

  // ── Format helpers ──
  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return d;
    }
  };

  const needTypeLabel = (type: string) => {
    const key = `need${type.charAt(0).toUpperCase() + type.slice(1)}`;
    return tt(key);
  };

  const needStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: tt('pending'),
      in_progress: tt('inProgress'),
      sent: tt('sent'),
      completed: tt('completed'),
    };
    return map[status] ?? status;
  };

  // ── Business name helper ──
  const businessName = group?.managedClient
    ? group.managedClient.displayName || group.managedClient.companyName
    : group?.localBusiness
    ? group.localBusiness.name
    : null;

  const businessType = group?.managedClient ? tt('managedClient') : group?.localBusiness ? tt('localBusiness') : null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-6">
        <button onClick={() => router.push('/admin/live-visits')} className="text-sm text-brand-600 hover:text-brand-700 mb-4 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {tt('back')}
        </button>
        <p className="text-gray-500">{tt('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            onClick={() => router.push('/admin/live-visits')}
            className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1 self-start"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {tt('back')}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                {businessName || `Visit #${group.id.slice(0, 8)}`}
              </h1>
              {businessType && (
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  {businessType}
                </span>
              )}
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  group.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {group.status === 'active' ? tt('active') : tt('completed')}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{formatDate(group.createdAt)}</p>
          </div>

          {group.status === 'active' && (
            <button
              onClick={handleComplete}
              className="self-start sm:self-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition flex-shrink-0"
            >
              {tt('completeVisit')}
            </button>
          )}
        </div>

        {/* ── Visitors Section ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{tt('visitors')}</h2>
          {group.visits.length === 0 ? (
            <p className="text-sm text-gray-400">{tt('noVisitors')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.visits.map(visit => {
                const leadId = visit.lead?.id;
                const isMain = leadId != null && leadId === group.mainContactId;
                const photo = visit.visitorPhoto || visit.lead?.photo;
                const name = visit.visitorName || visit.lead?.name || '';
                const email = visit.visitorEmail || visit.lead?.email;
                const company = visit.visitorCompany || visit.lead?.company;

                return (
                  <button
                    key={visit.id}
                    onClick={() => leadId && handleSetMainContact(leadId)}
                    title={leadId ? tt('setMainContact') : undefined}
                    className={`relative text-left p-3 rounded-xl border transition ${
                      isMain
                        ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    {isMain && (
                      <div className="absolute top-2 right-2">
                        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      {photo ? (
                        <img src={photo} alt={name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-brand-700">{name.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                        {email && <p className="text-xs text-gray-500 truncate">{email}</p>}
                        {company && <p className="text-xs text-gray-400 truncate">{company}</p>}
                      </div>
                    </div>
                    {isMain && (
                      <p className="text-[10px] font-medium text-brand-600 mt-2">{tt('mainContact')}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Business Linking Section ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{tt('business')}</h2>

          {group.managedClient || group.localBusiness ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{businessName}</p>
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 mt-1">
                    {businessType}
                  </span>
                  {(() => {
                    const biz = group.managedClient || group.localBusiness;
                    if (!biz) return null;
                    const parts = [biz.address, biz.city, biz.province, biz.postalCode].filter(Boolean);
                    return parts.length > 0 ? (
                      <p className="text-xs text-gray-500 mt-1">{parts.join(', ')}</p>
                    ) : null;
                  })()}
                </div>
                <button
                  onClick={() => setShowBusinessSearch(true)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 transition"
                >
                  {tt('changeBusiness')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-400 mb-3">{tt('noBusiness')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBusinessSearch(true)}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-xs font-medium transition"
                >
                  {tt('searchBusiness')}
                </button>
                <button
                  onClick={() => setShowCreateBiz(true)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-medium transition"
                >
                  {tt('createLocalBusiness')}
                </button>
              </div>
            </div>
          )}

          {/* Business search overlay */}
          {showBusinessSearch && (
            <div className="mt-4 border rounded-xl p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-600">{tt('searchBusiness')}</h3>
                <button onClick={() => { setShowBusinessSearch(false); setBusiness_query(''); setBusinessResults([]); }} className="text-xs text-gray-400 hover:text-gray-600">
                  {tt('cancel')}
                </button>
              </div>
              <input
                type="text"
                value={businessQuery}
                onChange={e => searchBusinesses(e.target.value)}
                placeholder={tt('searchBusiness')}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
              />
              {businessSearching && (
                <div className="flex justify-center py-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600" />
                </div>
              )}
              {businessResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {businessResults.map(biz => (
                    <button
                      key={`${biz.type}-${biz.id}`}
                      onClick={() => handleLinkBusiness(biz)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{biz.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          biz.type === 'managed' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {biz.type === 'managed' ? tt('managedClient') : tt('localBusiness')}
                        </span>
                      </div>
                      {biz.city && <p className="text-xs text-gray-500">{biz.city}</p>}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setShowBusinessSearch(false); setShowCreateBiz(true); }}
                className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700 transition"
              >
                + {tt('createLocalBusiness')}
              </button>
            </div>
          )}

          {/* Create local business form */}
          {showCreateBiz && (
            <div className="mt-4 border rounded-xl p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-600">{tt('createLocalBusiness')}</h3>
                <button onClick={() => setShowCreateBiz(false)} className="text-xs text-gray-400 hover:text-gray-600">
                  {tt('cancel')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('name')} *</label>
                  <input type="text" value={bizForm.name} onChange={e => setBizForm({ ...bizForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('address')}</label>
                  <input type="text" value={bizForm.address} onChange={e => setBizForm({ ...bizForm, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('city')}</label>
                  <input type="text" value={bizForm.city} onChange={e => setBizForm({ ...bizForm, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('province')}</label>
                  <input type="text" value={bizForm.province} onChange={e => setBizForm({ ...bizForm, province: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('postalCode')}</label>
                  <input type="text" value={bizForm.postalCode} onChange={e => setBizForm({ ...bizForm, postalCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('phone')}</label>
                  <input type="tel" value={bizForm.phone} onChange={e => setBizForm({ ...bizForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('email')}</label>
                  <input type="email" value={bizForm.email} onChange={e => setBizForm({ ...bizForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreateBiz(false)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-medium transition">
                  {tt('cancel')}
                </button>
                <button
                  onClick={handleCreateBiz}
                  disabled={bizCreating || !bizForm.name.trim()}
                  className="px-4 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-xs font-medium transition disabled:opacity-50"
                >
                  {bizCreating ? tt('saving') : tt('create')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Visit Needs Section ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">{tt('needs')}</h2>
            <button
              onClick={() => setShowNeedForm(!showNeedForm)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 transition"
            >
              {showNeedForm ? tt('cancel') : `+ ${tt('addNeed')}`}
            </button>
          </div>

          {/* Add need form */}
          {showNeedForm && (
            <div className="bg-gray-50 rounded-xl border p-4 mb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('needType')}</label>
                  <select
                    value={needForm.type}
                    onChange={e => setNeedForm({ ...needForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  >
                    {NEED_TYPES.map(t => (
                      <option key={t} value={t}>{needTypeLabel(t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('needDescription')}</label>
                  <input
                    type="text"
                    value={needForm.description}
                    onChange={e => setNeedForm({ ...needForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tt('needExpectedDate')}</label>
                  <input
                    type="date"
                    value={needForm.expectedDate}
                    onChange={e => setNeedForm({ ...needForm, expectedDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleAddNeed}
                  disabled={needSaving}
                  className="px-4 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-xs font-medium transition disabled:opacity-50"
                >
                  {needSaving ? tt('saving') : tt('addNeed')}
                </button>
              </div>
            </div>
          )}

          {/* Needs list */}
          {group.needs.length === 0 ? (
            <p className="text-sm text-gray-400">{tt('noNeeds')}</p>
          ) : (
            <div className="space-y-2">
              {group.needs.map(need => (
                <div key={need.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-gray-50 rounded-xl border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{needTypeLabel(need.type)}</span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${NEED_STATUS_COLORS[need.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {needStatusLabel(need.status)}
                      </span>
                      {need.expectedDate && (
                        <span className="text-[10px] text-gray-400">{formatDate(need.expectedDate)}</span>
                      )}
                    </div>
                    {need.description && <p className="text-xs text-gray-600 mt-1">{need.description}</p>}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {NEED_STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => handleNeedStatusChange(need.id, s)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                          need.status === s
                            ? NEED_STATUS_COLORS[s]
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                        }`}
                      >
                        {needStatusLabel(s)}
                      </button>
                    ))}
                    <button
                      onClick={() => handleDeleteNeed(need.id)}
                      className="p-1 text-gray-300 hover:text-red-500 transition ml-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Files Section ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">{tt('files')}</h2>
            <div className="flex items-center gap-2">
              {uploading && (
                <span className="text-xs text-gray-400">{tt('uploading')}</span>
              )}
              <button
                onClick={startCamera}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-medium transition"
              >
                {tt('takePhoto')}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-xs font-medium transition"
              >
                {tt('uploadFile')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx"
                capture="environment"
                onChange={onFileInputChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Camera preview */}
          {showCamera && (
            <div className="mb-4 rounded-xl overflow-hidden border bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-64 object-contain" />
              <div className="flex gap-2 p-3 bg-gray-900">
                <button
                  onClick={capturePhoto}
                  className="flex-1 px-4 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium transition hover:bg-gray-100"
                >
                  {tt('takePhoto')}
                </button>
                <button
                  onClick={stopCamera}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium transition hover:bg-gray-600"
                >
                  {tt('cancel')}
                </button>
              </div>
            </div>
          )}

          {group.files.length === 0 ? (
            <p className="text-sm text-gray-400">{tt('noFiles')}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.files.map(file => {
                const isImage = file.fileType.startsWith('image/');
                return (
                  <div key={file.id} className="rounded-xl border overflow-hidden bg-gray-50">
                    {isImage ? (
                      <div className="aspect-square bg-gray-100">
                        <img src={file.fileData} alt={file.fileName} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-square bg-gray-100 flex items-center justify-center">
                        <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-medium text-gray-900 truncate">{file.fileName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">
                          {file.fileType.split('/').pop()?.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-gray-400">{formatDate(file.createdAt)}</span>
                      </div>
                      {file.notes && <p className="text-[10px] text-gray-500 mt-1 truncate">{file.notes}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Notes Section ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{tt('notes')}</h2>
          <textarea
            value={notesValue}
            onChange={e => setNotesValue(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleSaveNotes}
              disabled={notesSaving}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
            >
              {notesSaving ? tt('saving') : tt('saveNotes')}
            </button>
          </div>
        </div>

        {/* ── Follow-up Date ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{tt('followUp')}</h2>
          <input
            type="date"
            value={followUp}
            onChange={e => handleFollowUpChange(e.target.value)}
            className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
          />
        </div>

      </div>
    </div>
  );
}
