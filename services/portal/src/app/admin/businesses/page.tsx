'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type QBClient, type ManagedClient, type ContactPerson } from '@/lib/mock-data';
import { useLanguage } from '@/lib/LanguageContext';
import { useQuickBooks } from '@/lib/QuickBooksContext';
import Avatar from '@/components/Avatar';
import StreetView from '@/components/StreetView';
import PageHeader from '@/components/PageHeader';
import { topFuzzyMatches } from '@/lib/fuzzy';

// ── Types ────────────────────────────────────────────────────────────────────

interface UnifiedBusiness {
  id: string;
  name: string;
  displayName: string;
  source: 'quickbooks' | 'local';
  qbId: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  _count: { visitGroups: number; leads: number; contacts: number };
}

interface QBCustomer {
  id: string;
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
}

interface QBInvoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amount: number;
  balance: number;
  status: string;
  date: string;
  dueDate: string;
  items: { description: string; model?: string; quantity: number; rate: number; amount: number }[];
}

interface Station {
  id: string;
  name: string;
  description?: string;
  invoiceId: string;
  invoiceNumber: string;
  linkedInvoices: { stationInvoiceId?: string; id: string; invoiceNumber: string }[];
  items: { description: string; quantity: number; rate: number; amount: number }[];
  status: 'not_configured' | 'waiting_pairing' | 'in_trouble' | 'active';
  createdAt: string;
}

// ── Reusable small components ────────────────────────────────────────────────

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    fill="none" viewBox="0 0 24 24" stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const HoldToConfirm = ({ onConfirm, onCancel, label = 'Are you sure?' }: { onConfirm: () => void; onCancel: () => void; label?: string }) => {
  const { t } = useLanguage();
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startRef = useRef(0);

  const startHold = () => {
    setHolding(true);
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / 2000, 1);
      setProgress(pct);
      if (pct >= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onConfirm();
      }
    }, 30);
  };

  const cancelHold = () => {
    setHolding(false);
    setProgress(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5 max-w-xs w-full text-center">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4">{label}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition">{t('common', 'no')}</button>
          <button
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            className="flex-1 px-4 py-2 bg-red-400 text-white rounded-lg text-sm font-medium transition relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-red-600 transition-none" style={{ width: `${progress * 100}%` }} />
            <span className="relative">{holding ? t('common', 'holding') : t('common', 'holdConfirm')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

const TrashIcon = ({ size = 'w-5 h-5' }: { size?: string }) => (
  <svg className={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

// ── CSS keyframes for flash animation (injected once) ────────────────────────
const FLASH_STYLE_ID = 'biz-flash-style';
if (typeof document !== 'undefined' && !document.getElementById(FLASH_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = FLASH_STYLE_ID;
  style.textContent = `
    @keyframes bizFlash {
      0%, 100% { background-color: transparent; }
      50% { background-color: rgba(var(--color-brand-500, 59 130 246) / 0.25); }
    }
    .biz-flash {
      animation: bizFlash 0.75s ease-in-out 4;
      pointer-events: auto;
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN INNER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function AdminBusinessesPageInner() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';
  const router = useRouter();
  const searchParams = useSearchParams();
  const pulseMainContact = searchParams.get('pulse') === 'maincontact';

  // ── Unified businesses state ──
  const [businesses, setBusinesses] = useState<UnifiedBusiness[]>([]);
  const [businessesLoading, setBusinessesLoading] = useState(true);

  // ── QB connection + data: sourced from QuickBooksContext (prefetched + refreshed in background) ──
  const qb = useQuickBooks();
  const qbClients = qb.customers.data as QBClient[];
  const qbConnected = qb.status === 'connected';
  const qbLoading = qb.customers.loading && qb.customers.data.length === 0;
  const dataSource = qb.customers.source;
  const credentialsConfigured = qb.status !== 'missing-creds';
  const [connectError, setConnectError] = useState<string | null>(null);

  // ── Top container: unlinked businesses + QB search ──
  const [selectedUnlinkedId, setSelectedUnlinkedId] = useState<string | null>(null);
  const [qbSearchQuery, setQbSearchQuery] = useState('');
  const [qbSearchResults, setQbSearchResults] = useState<QBCustomer[]>([]);
  const [qbSearchLoading, setQbSearchLoading] = useState(false);
  const [qbMatching, setQbMatching] = useState(false);

  // ── Flash state for newly linked ──
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);
  const linkedListRef = useRef<HTMLDivElement>(null);

  // ── New business modal ──
  const [showNewBusiness, setShowNewBusiness] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', address: '', city: '', province: '', postalCode: '', country: '', phone: '', email: '', website: '', notes: '' });
  const [newSaving, setNewSaving] = useState(false);

  // ── Managed clients (linked businesses) ──
  const [managedClients, setManagedClients] = useState<ManagedClient[]>([]);
  const [managedLoaded, setManagedLoaded] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // ── Contact form state ──
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactFormType, setContactFormType] = useState<'maincontact' | 'staff'>('maincontact');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<Omit<ContactPerson, 'id'>>({
    photo: null, name: '', email: '', phone: '', role: '',
  });
  const [contactError, setContactError] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');

  // ── Collapsible sections ──
  const [streetViewOpen, setStreetViewOpen] = useState(true);
  const [mainContactOpen, setMainContactOpen] = useState(true);
  const [staffOpen, setStaffOpen] = useState(true);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [stationsOpen, setStationsOpen] = useState(true);
  const [trainingAgendaOpen, setTrainingAgendaOpen] = useState(true);

  // ── Invoices ──
  const [clientInvoices, setClientInvoices] = useState<QBInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesSource, setInvoicesSource] = useState<string>('');

  // ── Invoice preview & station creation ──
  const [previewInvoice, setPreviewInvoice] = useState<QBInvoice | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [stationName, setStationName] = useState('');
  const [clientStations, setClientStations] = useState<Station[]>([]);
  const [stationMode, setStationMode] = useState<'new' | 'existing'>('new');
  const [selectedExistingStationId, setSelectedExistingStationId] = useState<string | null>(null);
  const [itemQuantities, setItemQuantities] = useState<Record<number, number>>({});

  // ── Training ──
  const [clientTrainings, setClientTrainings] = useState<any[]>([]);
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingTemplates, setTrainingTemplates] = useState<{ id: string; name: string; description: string }[]>([]);
  const [trainingForm, setTrainingForm] = useState({ title: '', description: '', date: '', duration: '', templateId: '' });
  const [trainingAttendees, setTrainingAttendees] = useState<{ contactId: string; name: string; email: string }[]>([]);
  const [trainingFiles, setTrainingFiles] = useState<{ name: string; fileType: string; fileData: string; fileSize: number }[]>([]);
  const [trainingSaving, setTrainingSaving] = useState(false);
  const [trainingDetail, setTrainingDetail] = useState<any | null>(null);

  // ── Password reset ──
  const [resetLockouts, setResetLockouts] = useState<Record<string, number>>({});
  const [resetCountdowns, setResetCountdowns] = useState<Record<string, number>>({});
  const [resetSending, setResetSending] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // ── Hold-to-confirm ──
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; id2?: string; label: string } | null>(null);

  // ── Derived ──
  const selectedClient = managedClients.find((mc) => mc.id === selectedClientId) || null;
  const unlinkedBusinesses = businesses.filter(b => b.source === 'local');

  const INPUT_CLS = 'input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent';

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchBusinesses = useCallback(async () => {
    try {
      const res = await fetch('/api/businesses');
      const data = await res.json();
      if (data.businesses) setBusinesses(data.businesses);
    } catch { /* silently fail */ }
    setBusinessesLoading(false);
  }, []);

  useEffect(() => { fetchBusinesses(); }, [fetchBusinesses]);

  // Fetch managed clients
  useEffect(() => {
    fetch('/api/managed-clients').then(r => r.json()).then(data => {
      if (data.clients) setManagedClients(data.clients);
      const clientParam = searchParams.get('client');
      if (clientParam && data.clients?.some((mc: ManagedClient) => mc.id === clientParam)) {
        setSelectedClientId(clientParam);
      }
      setManagedLoaded(true);
    }).catch(() => setManagedLoaded(true));
  }, [searchParams]);

  // QB status + customers are prefetched + refreshed by QuickBooksContext —
  // no local fetch needed. (Was previously two fetches on every mount.)

  // Fetch training templates
  useEffect(() => {
    fetch('/api/training/templates').then(r => r.json()).then(data => {
      setTrainingTemplates(data.templates || []);
    }).catch(() => {});
  }, []);

  // Fetch training events for selected client
  useEffect(() => {
    if (!selectedClientId) { setClientTrainings([]); return; }
    fetch(`/api/training/events?clientId=${selectedClientId}`).then(r => r.json()).then(data => {
      setClientTrainings(data.events || []);
    }).catch(() => setClientTrainings([]));
  }, [selectedClientId]);

  // Password reset countdown
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      const now = Date.now();
      setResetCountdowns(() => {
        const updated: Record<string, number> = {};
        let hasActive = false;
        for (const [email, expiry] of Object.entries(resetLockouts)) {
          const remaining = Math.ceil((expiry - now) / 1000);
          if (remaining > 0) { updated[email] = remaining; hasActive = true; }
        }
        return hasActive ? updated : {};
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [resetLockouts]);

  // ── Refresh stations ──
  const refreshStations = useCallback(async () => {
    if (!selectedClientId) { setClientStations([]); return; }
    try {
      const res = await fetch(`/api/stations?clientId=${selectedClientId}`);
      const data = await res.json();
      const rows = data.stations || [];
      const stations: Station[] = rows.map((row: Record<string, unknown>) => {
        let items: { description: string; quantity: number; rate: number; amount: number }[] = [];
        let invoiceId = '';
        let invoiceNumber = '';
        let description = '';
        let notesInvoices: { id: string; number: string }[] = [];
        try {
          const meta = JSON.parse((row.notes as string) || '{}');
          items = meta.items || [];
          invoiceId = meta.invoiceId || '';
          invoiceNumber = meta.invoiceNumber || '';
          description = meta.description || '';
          notesInvoices = Array.isArray(meta.invoices) ? meta.invoices : [];
        } catch { /* notes not JSON */ }

        const apiInvoices = Array.isArray(row.invoices)
          ? (row.invoices as Array<Record<string, unknown>>).map((inv) => ({
              stationInvoiceId: String(inv.id || ''),
              id: String(inv.qbInvoiceId || inv.id || ''),
              invoiceNumber: String(inv.invoiceNumber || ''),
            }))
          : [];
        const seen = new Set<string>();
        const linkedInvoices: Station['linkedInvoices'] = [];
        for (const inv of apiInvoices) {
          if (inv.invoiceNumber && !seen.has(inv.invoiceNumber)) {
            seen.add(inv.invoiceNumber);
            linkedInvoices.push(inv);
          }
        }
        for (const inv of notesInvoices) {
          if (inv.number && !seen.has(inv.number)) {
            seen.add(inv.number);
            linkedInvoices.push({ id: inv.id, invoiceNumber: inv.number });
          }
        }
        if (invoiceNumber && !seen.has(invoiceNumber)) {
          seen.add(invoiceNumber);
          linkedInvoices.push({ id: invoiceId, invoiceNumber });
        }

        return {
          id: row.id as string,
          name: row.title as string,
          description,
          invoiceId,
          invoiceNumber,
          linkedInvoices,
          items,
          status: (row.status as Station['status']) || 'not_configured',
          createdAt: row.createdAt as string,
        };
      });
      setClientStations(stations);
    } catch {
      setClientStations([]);
    }
  }, [selectedClientId]);

  // Load invoices + stations when selected client changes
  useEffect(() => {
    if (!selectedClientId) { setClientInvoices([]); setClientStations([]); return; }
    const client = managedClients.find((mc) => mc.id === selectedClientId);
    if (!client) return;
    const rawQbId = client.qbClient.id.replace(/^qb-/, '');
    const clientName = client.qbClient.displayName;
    setInvoicesLoading(true);
    fetch(`/api/quickbooks/invoices?customerId=${rawQbId}`).then(r => r.json()).then(data => {
      const allInvoices: QBInvoice[] = data.invoices || [];
      const filtered = allInvoices.filter(inv =>
        inv.clientId === rawQbId ||
        inv.clientName === clientName ||
        inv.clientName.toLowerCase() === clientName.toLowerCase()
      );
      setClientInvoices(filtered);
      setInvoicesSource(data.source || 'mock');
      setInvoicesLoading(false);
    }).catch(() => { setClientInvoices([]); setInvoicesLoading(false); });
    refreshStations();
  }, [selectedClientId, managedClients, refreshStations]);

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS — Top container (unlinked + QB linking)
  // ═══════════════════════════════════════════════════════════════════════════

  // Fuzzy scorer for QB suggestions — shared with Leads panel via lib/fuzzy.
  // Hugo's rule (see feedback_business_link_autocomplete.md): any "link an
  // entity" search must proactively surface 4–5 closest fuzzy matches as the
  // user types — no Enter key, no button press, no strict-substring dead-ends.

  // When clicking an unlinked business, auto-suggest QB matches.
  // Pulls from the in-memory QB cache instead of re-hitting the network.
  const handleSelectUnlinked = useCallback((biz: UnifiedBusiness) => {
    setSelectedUnlinkedId(biz.id);
    setQbSearchQuery(biz.name);
    setQbSearchLoading(true);
    try {
      const customers = qb.customers.data as unknown as QBCustomer[];
      const importedQbIds = new Set(businesses.filter(b => b.source === 'quickbooks' && b.qbId).map(b => b.qbId));
      const candidates = customers.filter(c => !importedQbIds.has(c.id));
      const matches = topFuzzyMatches(
        biz.name,
        candidates,
        [c => c.companyName, c => c.displayName],
        { limit: 5, minFallback: 4 },
      );
      setQbSearchResults(matches);
    } catch { /* silently fail */ }
    setQbSearchLoading(false);
  }, [businesses, qb.customers.data]);

  // Manual QB search in top container — live fuzzy-on-change.
  // No "Enter" or button press required: typing 2+ chars surfaces the
  // top 4–5 closest matches from the cached customers. This is the shared
  // fuzzy pattern used everywhere we "search an existing entity to link".
  const handleQbTopSearch = useCallback((rawQuery?: string) => {
    const q = (rawQuery ?? qbSearchQuery).trim();
    if (!q) { setQbSearchResults([]); return; }
    try {
      const customers = qb.customers.data as unknown as QBCustomer[];
      const importedQbIds = new Set(businesses.filter(b => b.source === 'quickbooks' && b.qbId).map(b => b.qbId));
      const candidates = customers.filter(c => !importedQbIds.has(c.id));
      const matches = topFuzzyMatches(
        q,
        candidates,
        [c => c.companyName, c => c.displayName],
        { limit: 5, minFallback: 4 },
      );
      setQbSearchResults(matches);
    } catch { /* silently fail */ }
  }, [qbSearchQuery, qb.customers.data, businesses]);

  // Match local business to QB customer (link)
  const handleMatchQb = async (customer: QBCustomer) => {
    if (!selectedUnlinkedId) return;
    setQbMatching(true);
    try {
      const res = await fetch(`/api/local-businesses/${selectedUnlinkedId}/match-qb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qbClient: customer }),
      });
      if (res.ok) {
        const data = await res.json();
        const newManagedId = data.managedClient?.id || data.client?.id || null;
        setSelectedUnlinkedId(null);
        setQbSearchQuery('');
        setQbSearchResults([]);
        await fetchBusinesses();
        // Refresh managed clients
        const mcRes = await fetch('/api/managed-clients');
        const mcData = await mcRes.json();
        if (mcData.clients) setManagedClients(mcData.clients);
        // Flash the newly linked business
        if (newManagedId) {
          setFlashId(newManagedId);
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setFlashId(null), 3000);
          // Scroll into view after a brief delay for render
          setTimeout(() => {
            const el = document.getElementById(`linked-biz-${newManagedId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
      }
    } catch { /* silently fail */ }
    setQbMatching(false);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS — New business creation
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCreateBusiness = async () => {
    setNewSaving(true);
    try {
      const res = await fetch('/api/local-businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newForm.name,
          address: newForm.address || null,
          city: newForm.city || null,
          province: newForm.province || null,
          postalCode: newForm.postalCode || null,
          country: newForm.country || null,
          phone: newForm.phone || null,
          email: newForm.email || null,
          website: newForm.website || null,
          notes: newForm.notes || null,
        }),
      });
      if (res.ok) {
        setShowNewBusiness(false);
        setNewForm({ name: '', address: '', city: '', province: '', postalCode: '', country: '', phone: '', email: '', website: '', notes: '' });
        await fetchBusinesses();
      }
    } catch { /* silently fail */ }
    setNewSaving(false);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS — Linked businesses (managed clients)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleConnectQB = async () => {
    setConnectError(null);
    try {
      const res = await fetch('/api/quickbooks/connect');
      const data = await res.json();
      if (data.authUrl) { window.location.href = data.authUrl; }
      else { setConnectError(data.details || data.error || 'Could not generate QuickBooks auth URL.'); }
    } catch { setConnectError('Failed to connect to QuickBooks. The server may be unreachable.'); }
  };

  const handleRemoveClient = async (clientId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}`, { method: 'DELETE' });
      setManagedClients(managedClients.filter((mc) => mc.id !== clientId));
      if (selectedClientId === clientId) setSelectedClientId(null);
      await fetchBusinesses();
    } catch (error) { console.error('Error removing client:', error); }
  };

  // ── Contact handlers ──
  const openContactForm = (type: 'maincontact' | 'staff') => {
    setContactFormType(type); setEditingContactId(null);
    setContactForm({ photo: null, name: '', email: '', phone: '', role: '' });
    setContactError(null); setReassignTargetId(''); setShowContactForm(true);
  };

  const openEditForm = (type: 'maincontact' | 'staff', contact: ContactPerson) => {
    setContactFormType(type); setEditingContactId(contact.id);
    setContactForm({ photo: contact.photo, name: contact.name, email: contact.email, phone: contact.phone, role: contact.role });
    setContactError(null); setResetMessage(null); setReassignTargetId(''); setShowContactForm(true);
  };

  const handleSaveContact = async () => {
    if (!selectedClient || !contactForm.name.trim() || !contactForm.email.trim()) return;
    setContactError(null);
    if (editingContactId) {
      const reassigning = reassignTargetId && reassignTargetId !== selectedClient.id;
      try {
        const res = await fetch(`/api/managed-clients/${selectedClient.id}/contacts/${editingContactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reassigning ? { ...contactForm, type: contactFormType, managedClientId: reassignTargetId } : { ...contactForm, type: contactFormType }),
        });
        const data = await res.json();
        if (res.status === 409) { setContactError(data.error); return; }
        if (data.contact) {
          try {
            const freshRes = await fetch('/api/managed-clients');
            const freshData = await freshRes.json();
            if (freshData.clients) setManagedClients(freshData.clients);
          } catch { /* fallback */ }
          if (reassigning) setSelectedClientId(reassignTargetId);
        }
      } catch (error) { console.error('Error updating contact:', error); }
      setShowContactForm(false); setEditingContactId(null); setReassignTargetId('');
    } else {
      try {
        const res = await fetch(`/api/managed-clients/${selectedClient.id}/contacts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...contactForm, type: contactFormType }),
        });
        const data = await res.json();
        if (res.status === 409) { setContactError(data.error); return; }
        if (data.contact) {
          try {
            const freshRes = await fetch('/api/managed-clients');
            const freshData = await freshRes.json();
            if (freshData.clients) setManagedClients(freshData.clients);
          } catch { /* fallback */ }
        }
      } catch (error) { console.error('Error adding contact:', error); }
      try {
        await fetch('/api/invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: contactForm.email, name: contactForm.name, role: contactForm.role || 'Staff Member', companyName: selectedClient.qbClient.companyName }),
        });
      } catch (error) { console.error('Error sending invitation:', error); }
      setShowContactForm(false); setEditingContactId(null);
    }
  };

  const handleRemoveEmployee = async (clientId: string, employeeId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${employeeId}`, { method: 'DELETE' });
      const freshRes = await fetch('/api/managed-clients');
      const freshData = await freshRes.json();
      if (freshData.clients) setManagedClients(freshData.clients);
    } catch (error) { console.error('Error removing staff member:', error); }
  };

  const handleRemoveResponsible = async (clientId: string, contactId?: string) => {
    const client = managedClients.find((mc) => mc.id === clientId);
    if (!client) return;
    const targetId = contactId || client.responsiblePerson?.id;
    if (!targetId) return;
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${targetId}`, { method: 'DELETE' });
      const freshRes = await fetch('/api/managed-clients');
      const freshData = await freshRes.json();
      if (freshData.clients) setManagedClients(freshData.clients);
    } catch (error) { console.error('Error removing main contact:', error); }
  };

  const handleArchiveContact = async (clientId: string, contactId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivedAt: new Date().toISOString() }),
      });
      const freshRes = await fetch('/api/managed-clients');
      const freshData = await freshRes.json();
      if (freshData.clients) setManagedClients(freshData.clients);
    } catch (error) { console.error('Error archiving contact:', error); }
  };

  const handleRestoreContact = async (clientId: string, contactId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivedAt: null }),
      });
      const freshRes = await fetch('/api/managed-clients');
      const freshData = await freshRes.json();
      if (freshData.clients) setManagedClients(freshData.clients);
    } catch (error) { console.error('Error restoring contact:', error); }
  };

  const handlePromoteToMain = async (clientId: string, contactId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'maincontact' }),
      });
      const freshRes = await fetch('/api/managed-clients');
      const freshData = await freshRes.json();
      if (freshData.clients) setManagedClients(freshData.clients);
    } catch (error) { console.error('Error promoting contact:', error); }
  };

  const handleDemoteToStaff = async (clientId: string, contactId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'staff' }),
      });
      const freshRes = await fetch('/api/managed-clients');
      const freshData = await freshRes.json();
      if (freshData.clients) setManagedClients(freshData.clients);
    } catch (error) { console.error('Error demoting contact:', error); }
  };

  const handleResetPassword = async (email: string, name: string) => {
    if (resetLockouts[email] && Date.now() < resetLockouts[email]) return;
    setResetSending(true);
    setResetMessage(null);
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = await response.json();
      setResetMessage(data.emailSent ? `${t('clients', 'resetSent')} ${email}` : (data.message || 'Reset link generated (email not configured)'));
      setResetLockouts((prev) => ({ ...prev, [email]: Date.now() + 120000 }));
    } catch { setResetMessage('Failed to send reset email'); }
    setResetSending(false);
  };

  // ── Invoice preview ──
  const openInvoicePreview = (invoice: QBInvoice) => {
    setPreviewInvoice(invoice);
    setSelectedItems(new Set());
    setStationName('');
    setStationMode(clientStations.length > 0 ? 'existing' : 'new');
    setSelectedExistingStationId(clientStations.length > 0 ? clientStations[0].id : null);
    setItemQuantities({});
  };

  const toggleItem = (index: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAllItems = () => {
    if (!previewInvoice) return;
    if (selectedItems.size === previewInvoice.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(previewInvoice.items.map((_, i) => i)));
    }
  };

  // ── Station creation ──
  const handleCreateStation = async () => {
    if (!previewInvoice || selectedItems.size === 0 || !selectedClient) return;
    const items = previewInvoice.items
      .map((item, i) => ({ item, index: i }))
      .filter(({ index }) => selectedItems.has(index))
      .map(({ item, index }) => {
        const qty = itemQuantities[index] || item.quantity;
        return { ...item, quantity: qty };
      });

    if (stationMode === 'existing' && selectedExistingStationId) {
      const existing = clientStations.find(s => s.id === selectedExistingStationId);
      if (existing) {
        const taggedItems = items.map(it => ({ ...it, sourceInvoiceId: previewInvoice.id, sourceInvoiceNumber: previewInvoice.invoiceNumber }));
        const updatedItems = [...existing.items, ...taggedItems];
        let existingMeta: Record<string, unknown> = {};
        try {
          const raw = await fetch(`/api/stations/${selectedExistingStationId}`).then(r => r.json());
          existingMeta = JSON.parse(raw.station?.notes || '{}');
        } catch { /* fallback */ }
        const invoices: { id: string; number: string }[] = (existingMeta.invoices as { id: string; number: string }[]) || [];
        if (existingMeta.invoiceId && !invoices.find((inv: { id: string }) => inv.id === existingMeta.invoiceId)) {
          invoices.push({ id: existingMeta.invoiceId as string, number: existingMeta.invoiceNumber as string });
        }
        if (!invoices.find((inv: { id: string }) => inv.id === previewInvoice.id)) {
          invoices.push({ id: previewInvoice.id, number: previewInvoice.invoiceNumber });
        }
        const notes = JSON.stringify({ ...existingMeta, invoiceId: existingMeta.invoiceId || previewInvoice.id, invoiceNumber: existingMeta.invoiceNumber || previewInvoice.invoiceNumber, invoices, items: updatedItems });
        try {
          await fetch(`/api/stations/${selectedExistingStationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes }),
          });
          await fetch(`/api/stations/${selectedExistingStationId}/invoices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qbInvoiceId: previewInvoice.id,
              invoiceNumber: previewInvoice.invoiceNumber,
              amount: previewInvoice.amount ?? null,
            }),
          }).catch(() => {});
        } catch { /* swallow */ }
        await refreshStations();
      }
    } else {
      const name = stationName.trim() || `Station — ${previewInvoice.invoiceNumber}`;
      const taggedItems = items.map((it) => ({
        ...it,
        sourceInvoiceId: previewInvoice.id,
        sourceInvoiceNumber: previewInvoice.invoiceNumber,
      }));
      const notes = JSON.stringify({ invoiceId: previewInvoice.id, invoiceNumber: previewInvoice.invoiceNumber, items: taggedItems });
      try {
        const res = await fetch('/api/stations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            managedClientId: selectedClient.id,
            title: name,
            notes,
          }),
        });
        const data = await res.json();
        if (data.station) {
          await fetch(`/api/stations/${data.station.id}/invoices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qbInvoiceId: previewInvoice.id,
              invoiceNumber: previewInvoice.invoiceNumber,
              amount: previewInvoice.amount ?? null,
            }),
          }).catch(() => {});
          await refreshStations();
        }
      } catch (err) {
        console.error('Failed to create station:', err);
      }
    }

    setSelectedItems(new Set());
    setStationName('');
    setItemQuantities({});
    setPreviewInvoice(null);
  };

  const handleDeleteStation = async (stationId: string) => {
    setClientStations(prev => prev.filter(s => s.id !== stationId));
    try {
      await fetch(`/api/stations/${stationId}`, { method: 'DELETE' });
    } catch { /* refresh below will reconcile */ }
    await refreshStations();
  };

  const handleDeleteTraining = async (trainingId: string) => {
    try {
      await fetch(`/api/training/events/${trainingId}`, { method: 'DELETE' });
      setClientTrainings(prev => prev.filter(t => t.id !== trainingId));
      if (trainingDetail?.id === trainingId) setTrainingDetail(null);
    } catch (err) { console.error('Failed to delete training:', err); }
  };

  const executeConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    switch (confirmDelete.type) {
      case 'station': handleDeleteStation(confirmDelete.id); break;
      case 'client': handleRemoveClient(confirmDelete.id); break;
      case 'maincontact': handleRemoveResponsible(confirmDelete.id, confirmDelete.id2); break;
      case 'staff': handleRemoveEmployee(confirmDelete.id, confirmDelete.id2 || ''); break;
      case 'training': handleDeleteTraining(confirmDelete.id); break;
    }
    setConfirmDelete(null);
  }, [confirmDelete]);

  const handleRemoveStationInvoice = async (
    stationId: string,
    inv: Station['linkedInvoices'][number]
  ) => {
    const label = inv.invoiceNumber || inv.id;
    if (!confirm(
      t('clients', 'confirmRemoveInvoice')?.replace('{number}', label) ||
      `Remove invoice #${label} from this station?`
    )) return;

    setClientStations(prev => prev.map(s =>
      s.id !== stationId
        ? s
        : {
            ...s,
            linkedInvoices: s.linkedInvoices.filter(x =>
              inv.stationInvoiceId
                ? x.stationInvoiceId !== inv.stationInvoiceId
                : x.invoiceNumber !== inv.invoiceNumber
            ),
          }
    ));

    try {
      if (inv.stationInvoiceId) {
        const res = await fetch(
          `/api/stations/${stationId}/invoices/${inv.stationInvoiceId}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error('delete failed');
      } else {
        const station = clientStations.find(s => s.id === stationId);
        if (!station) return;
        const getRes = await fetch(`/api/stations/${stationId}`);
        const getData = await getRes.json();
        const currentNotes = getData.station?.notes || '{}';
        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(currentNotes); } catch { meta = {}; }
        const invoices = Array.isArray(meta.invoices)
          ? (meta.invoices as { id: string; number: string }[]).filter(
              x => x.number !== inv.invoiceNumber && x.id !== inv.id
            )
          : [];
        const deletingPrimaryLegacy = meta.invoiceNumber === inv.invoiceNumber;
        const currentItems = Array.isArray(meta.items)
          ? (meta.items as { sourceInvoiceId?: string; sourceInvoiceNumber?: string }[])
          : [];
        const keptItems = currentItems.filter(it => {
          const tagMatches =
            it.sourceInvoiceId === inv.id ||
            it.sourceInvoiceNumber === inv.invoiceNumber;
          if (tagMatches) return false;
          const untagged = !it.sourceInvoiceId && !it.sourceInvoiceNumber;
          if (deletingPrimaryLegacy && untagged) return false;
          return true;
        });
        meta.items = keptItems;
        if (deletingPrimaryLegacy) {
          if (invoices.length > 0) {
            meta.invoiceId = invoices[0].id;
            meta.invoiceNumber = invoices[0].number;
          } else {
            delete meta.invoiceId;
            delete meta.invoiceNumber;
          }
        }
        meta.invoices = invoices;
        const res = await fetch(`/api/stations/${stationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: JSON.stringify(meta) }),
        });
        if (!res.ok) throw new Error('patch failed');
      }
      await refreshStations();
    } catch {
      await refreshStations();
      alert(t('clients', 'removeInvoiceFailed') || 'Could not remove invoice. Please refresh.');
    }
  };

  // ── Training ──
  const handleCreateTraining = async () => {
    if (!selectedClientId || !trainingForm.title.trim() || !trainingForm.date) return;
    setTrainingSaving(true);
    try {
      const res = await fetch('/api/training/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trainingForm.title,
          description: trainingForm.description || null,
          date: trainingForm.date,
          duration: trainingForm.duration ? parseInt(trainingForm.duration) : null,
          templateId: trainingForm.templateId || null,
          managedClientId: selectedClientId,
          attendees: trainingAttendees,
        }),
      });
      const data = await res.json();
      if (data.event) {
        if (trainingFiles.length > 0) {
          await Promise.all(trainingFiles.map(f =>
            fetch('/api/training/files', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...f, eventId: data.event.id }),
            })
          ));
        }
        if (trainingAttendees.length > 0) {
          await Promise.all(trainingAttendees.map(a =>
            fetch(`/api/managed-clients/${selectedClientId}/contacts/${a.contactId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trainingCompleted: true }),
            })
          ));
          const mcRes = await fetch('/api/managed-clients');
          const mcData = await mcRes.json();
          if (mcData.clients) setManagedClients(mcData.clients);
        }
        const evRes = await fetch(`/api/training/events?clientId=${selectedClientId}`);
        const evData = await evRes.json();
        setClientTrainings(evData.events || []);
        setShowTrainingForm(false);
        setTrainingForm({ title: '', description: '', date: '', duration: '', templateId: '' });
        setTrainingAttendees([]);
        setTrainingFiles([]);
      }
    } catch (err) {
      console.error('Failed to create training:', err);
    }
    setTrainingSaving(false);
  };

  const handleTrainingFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const ext = file.name.split('.').pop()?.toLowerCase() || 'other';
        let fileType = 'other';
        if (['pdf'].includes(ext)) fileType = 'pdf';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'image';
        else if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) fileType = 'video';
        setTrainingFiles(prev => [...prev, { name: file.name, fileType, fileData: base64, fileSize: file.size }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // ── Format helpers ──
  const formatDate = (dateStr: string) => { if (!dateStr) return '\u2014'; return new Date(dateStr).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }); };
  const stationStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'waiting_pairing': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'not_configured': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'in_trouble': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };
  const stationStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Working / Active';
      case 'waiting_pairing': return 'Configured / Waiting for first pairing';
      case 'not_configured': return 'Not fully configured';
      case 'in_trouble': return 'In trouble';
      default: return status;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── PAGE HEADER ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 p-4 sm:p-6 border-b bg-white dark:bg-gray-800">
        <PageHeader
          title={t('businesses', 'title')}
          subtitle={fr ? 'Gestion unifiée des entreprises et clients' : 'Unified business and client management'}
          actions={
            <button
              onClick={() => setShowNewBusiness(true)}
              className="btn-primary flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('businesses', 'newBusiness')}
            </button>
          }
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TOP CONTAINER: Unlinked businesses + QB suggestions              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {unlinkedBusinesses.length > 0 && (
        <div className="flex-shrink-0 border-b bg-amber-50/50 dark:bg-amber-900/10">
          <div className="px-4 sm:px-6 py-3">
            <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {fr ? 'Entreprises non reliées' : 'Businesses not linked yet'}
              <span className="text-xs font-normal text-amber-600 dark:text-amber-400">({unlinkedBusinesses.length})</span>
            </h2>
          </div>
          <div className="flex divide-x divide-amber-200 dark:divide-amber-800 max-h-[280px]">
            {/* LEFT: Unlinked business list */}
            <div className="w-1/2 overflow-y-auto">
              {unlinkedBusinesses.map(biz => (
                <button
                  key={biz.id}
                  onClick={() => handleSelectUnlinked(biz)}
                  className={`w-full text-left px-4 py-3 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition border-b border-amber-100 dark:border-amber-900/30 ${
                    selectedUnlinkedId === biz.id ? 'bg-amber-100 dark:bg-amber-900/30 border-l-4 border-l-amber-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">Local</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{biz.name}</p>
                  </div>
                  {biz.address && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate ml-[52px]">
                      {[biz.address, biz.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                </button>
              ))}
            </div>

            {/* RIGHT: QB search / suggestions */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              <div className="p-3 flex-shrink-0">
                <input
                  type="text"
                  placeholder={fr ? 'Taper pour voir les 4-5 correspondances...' : 'Type to see the top 4-5 matches...'}
                  value={qbSearchQuery}
                  onChange={e => {
                    const v = e.target.value;
                    setQbSearchQuery(v);
                    // Fire fuzzy-on-change (Hugo's rule: no Enter key, no button press).
                    handleQbTopSearch(v);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                {qbSearchResults.length > 0 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                    {fr
                      ? `${qbSearchResults.length} correspondance${qbSearchResults.length > 1 ? 's' : ''} la plus proche`
                      : `Top ${qbSearchResults.length} closest match${qbSearchResults.length > 1 ? 'es' : ''}`}
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {qbSearchResults.length === 0 && !qbSearchLoading ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                    {selectedUnlinkedId
                      ? (fr ? 'Aucune suggestion trouvee. Cherchez manuellement.' : 'No suggestions found. Search manually.')
                      : (fr ? 'Selectionnez une entreprise a gauche' : 'Select a business on the left')}
                  </p>
                ) : (
                  <div className="space-y-1 px-3 pb-3">
                    {qbSearchResults.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-gray-200 dark:border-gray-700">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.companyName || c.displayName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {[c.email, c.phone, c.city].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <button
                          onClick={() => handleMatchQb(c)}
                          disabled={qbMatching || !selectedUnlinkedId}
                          className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium transition disabled:opacity-50"
                        >
                          {qbMatching ? '...' : (fr ? 'Relier' : 'Match')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BOTTOM CONTAINER: Linked businesses (managed clients)            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Linked business list ──────────────────────────────── */}
        <div className={`flex flex-col border-r bg-white dark:bg-gray-800 transition-all duration-200 ${
          selectedClient ? 'hidden md:flex md:w-80 xl:w-96 flex-shrink-0' : 'w-full md:w-80 xl:w-96 flex-shrink-0'
        }`}>
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              {fr ? 'Entreprises reliées' : 'Linked Businesses'}
              <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({managedClients.length})</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto" ref={linkedListRef}>
            {!managedLoaded ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
              </div>
            ) : managedClients.length > 0 ? (
              managedClients.map((mc) => (
                <div
                  key={mc.id}
                  id={`linked-biz-${mc.id}`}
                  onClick={() => setSelectedClientId(mc.id)}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700 cursor-pointer transition-colors ${
                    selectedClientId === mc.id ? 'bg-brand-50 dark:bg-brand-900/30 border-l-2 border-l-brand-600' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  } ${flashId === mc.id ? 'biz-flash' : ''}`}
                >
                  <Avatar photo={null} name={mc.qbClient.displayName} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{mc.qbClient.displayName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{mc.qbClient.companyName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {(mc.mainContacts?.length || 0) > 0 && (
                        <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">{mc.mainContacts.length} {fr ? 'principal' : 'main'}{mc.mainContacts.length > 1 ? (fr ? 'aux' : 's') : ''}</span>
                      )}
                      {mc.subEmployees.length > 0 && (
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full">{mc.subEmployees.length} staff</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center">
                <svg className="w-10 h-10 text-gray-200 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('clients', 'noClientsEnrolled')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{fr ? 'Reliez des entreprises ci-dessus pour commencer' : 'Link businesses above to get started'}</p>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {managedClients.length} {t('clients', 'clientsEnrolled')}
            </p>
          </div>
        </div>

        {/* ── RIGHT: Client detail panel ──────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {selectedClient ? (
            <div className="p-4 sm:p-6 space-y-4">

              {/* Client Header */}
              <div className="card !p-0">
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-brand-50 to-white dark:from-brand-900/30 dark:to-gray-800">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar photo={null} name={selectedClient.qbClient.displayName} size="lg" />
                      <div>
                        <h2 className="text-lg font-bold">{selectedClient.qbClient.displayName}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{selectedClient.qbClient.companyName}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>{selectedClient.qbClient.email}</span>
                          <span>{selectedClient.qbClient.phone}</span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {selectedClient.qbClient.address}, {selectedClient.qbClient.city}, {selectedClient.qbClient.province} {selectedClient.qbClient.postalCode}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setConfirmDelete({ type: 'client', id: selectedClient.id, label: t('clients', 'removeClient') })} className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 px-3 py-1.5 rounded-lg transition-colors">{t('common', 'remove')}</button>
                  </div>
                </div>

                {/* Street View */}
                {(selectedClient.qbClient.address || selectedClient.qbClient.city) && (
                  <div className="border-b border-gray-100 dark:border-gray-700">
                    <button onClick={() => setStreetViewOpen(!streetViewOpen)} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <ChevronIcon open={streetViewOpen} />
                      <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('clients', 'streetView')}</span>
                    </button>
                    {streetViewOpen && (
                      <div className="px-5 pb-4">
                        <StreetView address={selectedClient.qbClient.address} city={selectedClient.qbClient.city} province={selectedClient.qbClient.province} postalCode={selectedClient.qbClient.postalCode} className="h-[180px]" />
                      </div>
                    )}
                  </div>
                )}

                {/* Main Contacts */}
                <div className="border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between px-5">
                    <button onClick={() => setMainContactOpen(!mainContactOpen)} className="flex items-center gap-2 py-3 hover:opacity-80 transition-opacity">
                      <ChevronIcon open={mainContactOpen} />
                      <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('clients', 'mainContact')}</span>
                      {(selectedClient.mainContacts?.length || 0) > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">({selectedClient.mainContacts.length})</span>}
                    </button>
                    <div className="flex items-center gap-2">
                      {mainContactOpen && (
                        <>
                          <button onClick={() => openContactForm('maincontact')} className={`text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors ${pulseMainContact ? 'animate-pulse ring-2 ring-green-400 ring-offset-2 dark:ring-offset-gray-800' : ''}`}>{t('clients', 'setMainContact')}</button>
                          <button onClick={() => setArchivesOpen(!archivesOpen)} className="text-xs bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors">{fr ? 'Archives' : 'Archives'}</button>
                        </>
                      )}
                    </div>
                  </div>
                  {mainContactOpen && (
                    <div className="px-5 pb-4">
                      {(selectedClient.mainContacts?.length || 0) > 0 ? (
                        <div className="space-y-2">
                          {selectedClient.mainContacts.map((mc) => (
                            <div key={mc.id} className="bg-green-50 dark:bg-green-900/30 rounded-xl p-4">
                              <div className="flex items-center gap-4">
                                <Avatar photo={mc.photo} name={mc.name} size="lg" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" /></svg>
                                    <p className="font-semibold truncate">{mc.name}</p>
                                  </div>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">{mc.role}</p>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    <span>{mc.email}</span>
                                    {mc.phone && <span className="ml-3">{mc.phone}</span>}
                                  </div>
                                  <div className="mt-1.5 ml-0.5">
                                    <div className="flex items-center text-[11px]">
                                      <span className="flex-shrink-0 w-5 flex items-center text-gray-300 dark:text-gray-600">
                                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2v16M6 10h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                      </span>
                                      <span className={`${mc.trainingCompleted ? 'text-green-600 dark:text-green-400' : 'text-red-400 dark:text-red-500'}`}>
                                        {mc.trainingCompleted ? (fr ? 'Formation completee' : 'Training completed') : (fr ? 'Formation non completee' : 'Training not completed')}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onClick={() => handleDemoteToStaff(selectedClient.id, mc.id)} className="text-gray-400 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 transition-colors p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700" title={fr ? 'Retrograder' : 'Demote to staff'}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                  </button>
                                  <button onClick={() => handleArchiveContact(selectedClient.id, mc.id)} className="text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 transition-colors p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700" title={fr ? 'Archiver' : 'Archive'}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                  </button>
                                  <button onClick={() => openEditForm('maincontact', mc)} className="text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700" title={t('common', 'edit')}><EditIcon /></button>
                                  <button onClick={() => setConfirmDelete({ type: 'maincontact', id: selectedClient.id, id2: mc.id, label: t('clients', 'removeMainContact') })} className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700" title={t('common', 'remove')}><TrashIcon /></button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">{t('clients', 'noMainContact')}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Staff */}
                <div className="border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between px-5">
                    <button onClick={() => setStaffOpen(!staffOpen)} className="flex items-center gap-2 py-3 hover:opacity-80 transition-opacity">
                      <ChevronIcon open={staffOpen} />
                      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('clients', 'staff')}</span>
                      {selectedClient.subEmployees.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">({selectedClient.subEmployees.length})</span>}
                    </button>
                    <div className="flex items-center gap-2">
                      {staffOpen && (
                        <button onClick={() => openContactForm('staff')} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">{t('clients', 'addStaff')}</button>
                      )}
                    </div>
                  </div>
                  {staffOpen && (
                    <div className="px-5 pb-4">
                      {selectedClient.subEmployees.length > 0 ? (
                        <div className="space-y-2">
                          {selectedClient.subEmployees.map((emp) => (
                            <div key={emp.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-xl p-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                              <Avatar photo={emp.photo} name={emp.name} size="md" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{emp.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{emp.role}</p>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                  <span>{emp.email}</span>
                                  {emp.phone && <span className="ml-3">{emp.phone}</span>}
                                </div>
                                <div className="mt-1.5 ml-0.5">
                                  <div className="flex items-center text-[11px]">
                                    <span className="flex-shrink-0 w-5 flex items-center text-gray-300 dark:text-gray-600">
                                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2v16M6 10h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </span>
                                    <span className={`${emp.trainingCompleted ? 'text-green-600 dark:text-green-400' : 'text-red-400 dark:text-red-500'}`}>
                                      {emp.trainingCompleted ? (fr ? 'Formation completee' : 'Training completed') : (fr ? 'Formation non completee' : 'Training not completed')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => handlePromoteToMain(selectedClient.id, emp.id)} className="text-gray-400 dark:text-gray-500 hover:text-yellow-500 dark:hover:text-yellow-400 transition-colors p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700" title={fr ? 'Promouvoir' : 'Promote to main contact'}>
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                </button>
                                <button onClick={() => handleArchiveContact(selectedClient.id, emp.id)} className="text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 transition-colors p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700" title={fr ? 'Archiver' : 'Archive'}>
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                </button>
                                <button onClick={() => openEditForm('staff', emp)} className="text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700" title={t('common', 'edit')}><EditIcon /></button>
                                <button onClick={() => setConfirmDelete({ type: 'staff', id: selectedClient.id, id2: emp.id, label: t('clients', 'removeStaff') })} className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700" title={t('common', 'remove')}><TrashIcon size="w-4 h-4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">{t('clients', 'noStaff')}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Archives */}
                {archivesOpen && (
                  <div className="border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between px-5">
                      <div className="flex items-center gap-2 py-3">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Archives</span>
                        {(selectedClient.archivedContacts?.length || 0) > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">({selectedClient.archivedContacts.length})</span>}
                      </div>
                      <button onClick={() => setArchivesOpen(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="px-5 pb-4">
                      {(selectedClient.archivedContacts?.length || 0) > 0 ? (
                        <div className="space-y-2">
                          {selectedClient.archivedContacts.map((arc) => (
                            <div key={arc.id} className="flex items-center gap-3 bg-gray-100 dark:bg-gray-800 rounded-xl p-3 opacity-70">
                              <Avatar photo={arc.photo} name={arc.name} size="md" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm text-gray-600 dark:text-gray-400">{arc.name}</p>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                    {(arc.type === 'maincontact' || arc.type === 'responsible') ? (fr ? 'Contact principal' : 'Main contact') : (fr ? 'Personnel' : 'Staff')}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 dark:text-gray-500">{arc.email}</p>
                                {arc.archivedAt && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{fr ? 'Archive le' : 'Archived'} {new Date(arc.archivedAt).toLocaleDateString(fr ? 'fr-CA' : 'en-CA')}</p>}
                              </div>
                              <button onClick={() => handleRestoreContact(selectedClient.id, arc.id)} className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 px-3 py-1.5 rounded-lg transition-colors">
                                {fr ? 'Restaurer' : 'Restore'}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">{fr ? 'Aucun contact archive' : 'No archived contacts'}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* INVOICES BOX */}
              <div className="card !p-0">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-white dark:from-purple-900/30 dark:to-gray-800">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {t('clients', 'invoices')}
                      {clientInvoices.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({clientInvoices.length})</span>}
                    </h3>
                    <div className="flex items-center gap-2">
                      {invoicesSource === 'mock' && <span className="text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-0.5 rounded">{t('clients', 'demoData')}</span>}
                      <span className="text-[10px] text-purple-500">{t('clients', 'clickInvoice')}</span>
                    </div>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {invoicesLoading ? (
                    <div className="p-6 text-center">
                      <div className="animate-spin w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-2"></div>
                      <p className="text-sm text-gray-400 dark:text-gray-500">{t('clients', 'loadingInvoices')}</p>
                    </div>
                  ) : clientInvoices.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700 text-left">
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('clients', 'invoiceNumber')}</th>
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('common', 'date')}</th>
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">{t('clients', 'items')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientInvoices.map((inv) => (
                          <tr key={inv.id} onClick={() => openInvoicePreview(inv)} className="border-b border-gray-50 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors cursor-pointer group">
                            <td className="px-4 py-3 font-medium group-hover:text-purple-700 dark:group-hover:text-purple-400">{inv.invoiceNumber}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(inv.date)}</td>
                            <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{inv.items?.length || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-center">
                      <svg className="w-10 h-10 text-gray-200 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm text-gray-400 dark:text-gray-500">{t('clients', 'noInvoices')}</p>
                    </div>
                  )}
                </div>
                {clientInvoices.length > 0 && (
                  <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{clientInvoices.length} {clientInvoices.length === 1 ? 'invoice' : 'invoices'}</p>
                  </div>
                )}
              </div>

              {/* STATIONS BOX */}
              <div className="card !p-0">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-orange-50 to-white dark:from-orange-900/30 dark:to-gray-800">
                  <button onClick={() => setStationsOpen(!stationsOpen)} className="w-full flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      {t('clients', 'stationsSection')}
                      {clientStations.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({clientStations.length})</span>}
                    </h3>
                    <ChevronIcon open={stationsOpen} />
                  </button>
                </div>
                {stationsOpen && (
                  <div>
                    {clientStations.length > 0 ? (
                      <div className="divide-y divide-gray-50 dark:divide-gray-700">
                        {clientStations.map((station) => (
                          <div key={station.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="font-medium text-sm text-left hover:text-purple-600 hover:underline transition-colors"
                                    onClick={(e) => { e.stopPropagation(); router.push(`/admin/stations?stationId=${station.id}`); }}
                                    title={t('clients', 'openInStations') || 'Open in Stations'}
                                  >
                                    {station.name}
                                  </button>
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${stationStatusColor(station.status)}`}>
                                    {stationStatusLabel(station.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('clients', 'fromInvoice')} {station.invoiceNumber} — {formatDate(station.createdAt)}</p>
                                {station.linkedInvoices && station.linkedInvoices.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mr-1">
                                      {t('clients', 'linkedInvoices') || 'Linked invoices'}:
                                    </span>
                                    {station.linkedInvoices.map((inv) => (
                                      <span
                                        key={`${station.id}-${inv.invoiceNumber}`}
                                        className="group inline-flex items-center gap-1 text-[10px] font-medium pl-1.5 pr-1 py-0.5 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
                                      >
                                        <span>#{inv.invoiceNumber}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveStationInvoice(station.id, inv);
                                          }}
                                          className="flex items-center justify-center w-3.5 h-3.5 rounded-full text-orange-500 hover:text-white hover:bg-orange-500 transition-colors"
                                          title={t('clients', 'removeInvoiceTooltip') || 'Remove this invoice from the station'}
                                          aria-label={t('clients', 'removeInvoiceTooltip') || 'Remove this invoice from the station'}
                                        >
                                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {station.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{station.description}</p>
                                )}
                              </div>
                              <button onClick={() => setConfirmDelete({ type: 'station', id: station.id, label: t('clients', 'deleteStation') })} className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 ml-3" title={t('common', 'delete')}>
                                <TrashIcon size="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <svg className="w-10 h-10 text-gray-200 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <p className="text-sm text-gray-400 dark:text-gray-500">{t('clients', 'noStations')}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('clients', 'clickInvoiceStations')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TRAINING AGENDA BOX */}
              <div className="card !p-0">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-teal-50 to-white dark:from-teal-900/30 dark:to-gray-800">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setTrainingAgendaOpen(!trainingAgendaOpen)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                      <ChevronIcon open={trainingAgendaOpen} />
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {t('clients', 'trainingAgenda')}
                        {clientTrainings.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({clientTrainings.length})</span>}
                      </h3>
                    </button>
                    {trainingAgendaOpen && (
                      <button
                        onClick={() => { setShowTrainingForm(true); setTrainingDetail(null); setTrainingForm({ title: '', description: '', date: '', duration: '', templateId: '' }); setTrainingAttendees([]); setTrainingFiles([]); }}
                        className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        {t('clients', 'newTraining')}
                      </button>
                    )}
                  </div>
                </div>
                {trainingAgendaOpen && (
                  <div>
                    {clientTrainings.length > 0 ? (
                      <div className="divide-y divide-gray-50 dark:divide-gray-700">
                        {clientTrainings.map((tr: any) => (
                          <div key={tr.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer" onClick={() => setTrainingDetail(tr)}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{tr.title}</p>
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                    tr.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                    tr.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                                  }`}>
                                    {tr.status}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                  {formatDate(tr.date)}
                                  {tr.duration && <span> — {tr.duration} min</span>}
                                  {tr.template && <span> — Template: {tr.template.name}</span>}
                                </p>
                                {tr.attendees?.length > 0 && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tr.attendees.length} attendee{tr.attendees.length !== 1 ? 's' : ''}</p>
                                )}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'training', id: tr.id, label: 'Delete this training?' }); }}
                                className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 ml-2"
                              >
                                <TrashIcon size="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <svg className="w-10 h-10 text-gray-200 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <p className="text-sm text-gray-400 dark:text-gray-500">{t('clients', 'noTrainings')}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('clients', 'clickNewTraining')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 text-gray-200 dark:text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <p className="text-gray-400 dark:text-gray-500 text-sm">{t('clients', 'selectClient')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ── New Business Modal ─────────────────────────────────────────── */}
      {showNewBusiness && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('businesses', 'newBusiness')}</h3>
              <button onClick={() => setShowNewBusiness(false)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'name')} *</label>
                <input type="text" value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'address')}</label>
                <input type="text" value={newForm.address} onChange={e => setNewForm({ ...newForm, address: e.target.value })} className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'city')}</label>
                  <input type="text" value={newForm.city} onChange={e => setNewForm({ ...newForm, city: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'province')}</label>
                  <input type="text" value={newForm.province} onChange={e => setNewForm({ ...newForm, province: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'postalCode')}</label>
                  <input type="text" value={newForm.postalCode} onChange={e => setNewForm({ ...newForm, postalCode: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'country')}</label>
                  <input type="text" value={newForm.country} onChange={e => setNewForm({ ...newForm, country: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'phone')}</label>
                  <input type="tel" value={newForm.phone} onChange={e => setNewForm({ ...newForm, phone: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'email')}</label>
                  <input type="email" value={newForm.email} onChange={e => setNewForm({ ...newForm, email: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'website')}</label>
                <input type="url" value={newForm.website} onChange={e => setNewForm({ ...newForm, website: e.target.value })} placeholder="https://" className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('businesses', 'notes')}</label>
                <textarea value={newForm.notes} onChange={e => setNewForm({ ...newForm, notes: e.target.value })} rows={3} className={`${INPUT_CLS} resize-none`} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setShowNewBusiness(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition"
              >
                {t('businesses', 'cancel')}
              </button>
              <button
                onClick={handleCreateBusiness}
                disabled={newSaving || !newForm.name.trim()}
                className="btn-primary px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
              >
                {newSaving ? t('businesses', 'saving') : t('businesses', 'create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice Preview Modal ──────────────────────────────────────── */}
      {previewInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Invoice {previewInvoice.invoiceNumber}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{previewInvoice.clientName}</p>
                </div>
                <button onClick={() => setPreviewInvoice(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-6 mt-3 text-sm">
                <div><span className="text-gray-400 dark:text-gray-500">Date:</span> <span className="font-medium">{formatDate(previewInvoice.date)}</span></div>
                <div><span className="text-gray-400 dark:text-gray-500">Due:</span> <span className="font-medium">{formatDate(previewInvoice.dueDate)}</span></div>
                <div><span className="text-gray-400 dark:text-gray-500">Items:</span> <span className="font-medium">{previewInvoice.items?.length || 0}</span></div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('clients', 'lineItems')}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('clients', 'selectItems')}</p>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 mb-2">
                <div className="w-6" />
                <div className="w-24">{t('clients', 'model')}</div>
                <div className="flex-1">{t('common', 'description')}</div>
                <div className="w-20 text-center">{t('clients', 'stationsCreated')}</div>
                <div className="w-20 text-center">{t('clients', 'stationsAvailable')}</div>
              </div>

              <div className="space-y-2">
                {previewInvoice.items.map((item, index) => {
                  const stationsForItem = clientStations.filter(s =>
                    s.invoiceId === previewInvoice.id &&
                    s.items.some(si => si.description === item.description)
                  ).length;
                  const available = Math.max(0, item.quantity - stationsForItem);

                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        selectedItems.has(index)
                          ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/30'
                          : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(index)}
                          onChange={() => toggleItem(index)}
                          className="w-4 h-4 mx-2 text-purple-600 rounded border-gray-300 dark:border-gray-600 focus:ring-purple-500"
                        />
                        <div className="w-24">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{item.model || '\u2014'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.description}</p>
                        </div>
                        <div className="w-20 text-center">
                          <span className={`text-xs font-medium ${stationsForItem > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                            {stationsForItem}
                          </span>
                        </div>
                        <div className="w-20 text-center">
                          <span className={`text-xs font-medium ${available > 0 ? 'text-purple-600' : 'text-gray-300'}`}>
                            {available}
                          </span>
                        </div>
                      </label>
                      {selectedItems.has(index) && available > 1 && (
                        <div className="mt-3 ml-8 flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-2 border border-purple-200 dark:border-purple-700">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{t('clients', 'howManyStations')}</span>
                          <select
                            value={itemQuantities[index] || 1}
                            onChange={(e) => setItemQuantities(prev => ({ ...prev, [index]: parseInt(e.target.value) }))}
                            className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-800 dark:text-gray-100"
                          >
                            {Array.from({ length: available }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{n} station{n > 1 ? 's' : ''}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-2xl flex-shrink-0">
              {selectedItems.size > 0 ? (
                <div className="space-y-3">
                  {clientStations.length > 0 && (
                    <div className="flex items-center gap-4 mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="stationMode" checked={stationMode === 'existing'} onChange={() => setStationMode('existing')} className="text-purple-600 focus:ring-purple-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('clients', 'addToExisting')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="stationMode" checked={stationMode === 'new'} onChange={() => setStationMode('new')} className="text-purple-600 focus:ring-purple-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('clients', 'createNewStation')}</span>
                      </label>
                    </div>
                  )}
                  {stationMode === 'existing' && clientStations.length > 0 && (
                    <select value={selectedExistingStationId || ''} onChange={(e) => setSelectedExistingStationId(e.target.value)} className="input-field text-sm !py-2 w-full">
                      {clientStations.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.items.length} item{s.items.length !== 1 ? 's' : ''})</option>
                      ))}
                    </select>
                  )}
                  {stationMode === 'new' && (
                    <input type="text" placeholder={`${t('clients', 'stationNameDefault')} ${previewInvoice.invoiceNumber})`} value={stationName} onChange={(e) => setStationName(e.target.value)} className="input-field text-sm !py-2 w-full" />
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{selectedItems.size} {t('clients', 'itemsSelected')}</span>
                    <button onClick={handleCreateStation} className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      {stationMode === 'existing' ? t('clients', 'addToStation') : t('clients', 'createStation')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center">{t('clients', 'selectLineItems')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Hold-to-confirm Delete ─────────────────────────────────────── */}
      {confirmDelete && (
        <HoldToConfirm
          label={confirmDelete.label}
          onConfirm={executeConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ── Add/Edit Contact Modal ─────────────────────────────────────── */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold">
                {editingContactId
                  ? (contactFormType === 'maincontact' ? t('clients', 'editMainContact') : t('clients', 'editStaff'))
                  : (contactFormType === 'maincontact' ? t('clients', 'setMainContact') : t('clients', 'addStaffMember'))}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {contactFormType === 'maincontact' ? t('clients', 'mainContactDesc') : t('clients', 'staffDesc')}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar photo={contactForm.photo} name={contactForm.name || '?'} size="xl" editable onPhotoChange={(base64) => setContactForm({ ...contactForm, photo: base64 })} />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('clients', 'profilePhoto')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('clients', 'clickAvatar')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('clients', 'leaveEmptyInitials')}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'fullName')}</label>
                <input className="input-field" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} placeholder="e.g. Pierre Martin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'emailRequired')}</label>
                <input className="input-field" type="email" value={contactForm.email} onChange={(e) => { setContactForm({ ...contactForm, email: e.target.value }); setContactError(null); }} placeholder="e.g. pierre@company.ca" />
                {contactError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{contactError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'phoneLabel')}</label>
                <input className="input-field" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="e.g. 514-555-0000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'roleLabel')}</label>
                <input className="input-field" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} placeholder="e.g. IT Manager, Receptionist, Owner" />
              </div>

              {/* Type toggle */}
              {editingContactId && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{fr ? 'Type de contact' : 'Contact type'}</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setContactFormType('maincontact')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${contactFormType === 'maincontact' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 ring-2 ring-yellow-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" /></svg>
                      {fr ? 'Contact principal' : 'Main contact'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactFormType('staff')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${contactFormType === 'staff' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      {fr ? 'Personnel' : 'Staff'}
                    </button>
                  </div>
                </div>
              )}

              {/* QR Code */}
              {editingContactId && contactForm.email && (
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('clients', 'profileQRCode')}</label>
                  <div className="flex items-center gap-3">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                        `${typeof window !== 'undefined' ? window.location.origin : ''}/profile/${editingContactId}`
                      )}`}
                      alt="QR Code"
                      className="w-24 h-24 border border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                    <div className="flex flex-col gap-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <p>{t('clients', 'scanToEdit')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const profileUrl = `${window.location.origin}/profile/${editingContactId}`;
                          const subject = encodeURIComponent('Your Profile Link - Atelier DSM');
                          const body = encodeURIComponent(`Hi ${contactForm.name},\n\nHere is your profile link where you can update your information:\n${profileUrl}\n\nBest regards,\nAtelier DSM`);
                          window.open(`mailto:${contactForm.email}?subject=${subject}&body=${body}`, '_blank');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {t('clients', 'sendTo')} {contactForm.name.split(' ')[0] || 'contact'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Reassign */}
              {editingContactId && managedClients.length > 1 && (
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('clients', 'reassignSection')}
                  </label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{t('clients', 'reassignDesc')}</p>
                  <select
                    className="input-field"
                    value={reassignTargetId}
                    onChange={(e) => setReassignTargetId(e.target.value)}
                  >
                    <option value="">{t('clients', 'reassignKeep')}</option>
                    {managedClients
                      .filter((mc) => mc.id !== selectedClient?.id)
                      .map((mc) => (
                        <option key={mc.id} value={mc.id}>
                          {mc.qbClient.companyName}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Password reset */}
              {editingContactId && contactForm.email && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('clients', 'passwordSection')}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{t('clients', 'sendResetEmail')}</p>
                    </div>
                    <button type="button" onClick={() => handleResetPassword(contactForm.email, contactForm.name)}
                      disabled={resetSending || (!!resetCountdowns[contactForm.email] && resetCountdowns[contactForm.email] > 0)}
                      className="text-xs bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      {resetSending ? t('clients', 'resetSending') : resetCountdowns[contactForm.email] && resetCountdowns[contactForm.email] > 0 ? `${t('clients', 'waitSeconds')} ${resetCountdowns[contactForm.email]}s` : t('clients', 'resetPassword')}
                    </button>
                  </div>
                  {resetMessage && <p className={`text-xs mt-2 ${resetMessage.includes('sent') ? 'text-green-600' : 'text-yellow-600'}`}>{resetMessage}</p>}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => { setShowContactForm(false); setEditingContactId(null); setReassignTargetId(''); }} className="btn-secondary">{t('common', 'cancel')}</button>
              <button onClick={handleSaveContact} disabled={!contactForm.name.trim() || !contactForm.email.trim()} className="btn-primary disabled:opacity-50">
                {editingContactId ? t('clients', 'saveChanges') : (contactFormType === 'maincontact' ? t('clients', 'setAsMainContact') : t('clients', 'addStaffMember'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Training Modal ─────────────────────────────────────────── */}
      {showTrainingForm && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    {t('clients', 'newTraining')}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('clients', 'forCompany')} {selectedClient.qbClient.companyName}</p>
                </div>
                <button onClick={() => setShowTrainingForm(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'trainingTemplate')}</label>
                {trainingTemplates.length > 0 ? (
                  <select
                    value={trainingForm.templateId}
                    onChange={(e) => {
                      const tpl = trainingTemplates.find(t => t.id === e.target.value);
                      setTrainingForm({ ...trainingForm, templateId: e.target.value, title: tpl ? tpl.name : trainingForm.title, description: tpl ? tpl.description : trainingForm.description });
                    }}
                    className="input-field text-sm"
                  >
                    <option value="">{t('clients', 'noTemplate')}</option>
                    {trainingTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs rounded-lg px-3 py-2">
                    {t('clients', 'noTemplatesWarning')}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'titleRequired')}</label>
                <input className="input-field" value={trainingForm.title} onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })} placeholder="e.g. Laser Safety Training" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common', 'description')}</label>
                <textarea className="input-field text-sm" rows={2} value={trainingForm.description} onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })} placeholder="Optional details..." />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'dateRequired')}</label>
                  <input type="datetime-local" className="input-field text-sm" value={trainingForm.date} onChange={(e) => setTrainingForm({ ...trainingForm, date: e.target.value })} />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'durationMin')}</label>
                  <input type="number" className="input-field text-sm" value={trainingForm.duration} onChange={(e) => setTrainingForm({ ...trainingForm, duration: e.target.value })} placeholder="60" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'attendees')}</label>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{t('clients', 'addStaffFrom')} {selectedClient.qbClient.companyName}</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(selectedClient.mainContacts || []).map(mc => (
                    <div key={mc.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar photo={mc.photo} name={mc.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{mc.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{mc.role || 'Main Contact'}</p>
                        </div>
                      </div>
                      {trainingAttendees.some(a => a.contactId === mc.id) ? (
                        <button onClick={() => setTrainingAttendees(prev => prev.filter(a => a.contactId !== mc.id))} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30">Remove</button>
                      ) : (
                        <button onClick={() => setTrainingAttendees(prev => [...prev, { contactId: mc.id, name: mc.name, email: mc.email }])} className="text-xs text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 dark:hover:bg-teal-900/30 font-medium">+ Add</button>
                      )}
                    </div>
                  ))}
                  {selectedClient.subEmployees.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar photo={emp.photo} name={emp.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{emp.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{emp.role || 'Staff'}</p>
                        </div>
                      </div>
                      {trainingAttendees.some(a => a.contactId === emp.id) ? (
                        <button onClick={() => setTrainingAttendees(prev => prev.filter(a => a.contactId !== emp.id))} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30">Remove</button>
                      ) : (
                        <button onClick={() => setTrainingAttendees(prev => [...prev, { contactId: emp.id, name: emp.name, email: emp.email }])} className="text-xs text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 dark:hover:bg-teal-900/30 font-medium">+ Add</button>
                      )}
                    </div>
                  ))}
                  {(selectedClient.mainContacts || []).length === 0 && selectedClient.subEmployees.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">{t('clients', 'noContactsToAdd')}</p>
                  )}
                </div>
                {trainingAttendees.length > 0 && (
                  <p className="text-xs text-teal-600 mt-2 font-medium">{trainingAttendees.length} {t('clients', 'attendeesSelected')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('clients', 'filesSection')}</label>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{t('clients', 'attachBooklet')}</p>
                {trainingFiles.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {trainingFiles.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 rounded-lg px-3 py-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          <span className="text-blue-700 dark:text-blue-300 font-medium truncate max-w-[200px]">{f.name}</span>
                          <span className="text-blue-400 dark:text-blue-500 text-xs">{(f.fileSize / 1024).toFixed(0)} KB</span>
                        </div>
                        <button type="button" onClick={() => setTrainingFiles(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {t('clients', 'uploadFiles')}
                  <input type="file" multiple className="hidden" onChange={handleTrainingFileUpload} />
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowTrainingForm(false)} className="btn-secondary">{t('common', 'cancel')}</button>
              <button
                onClick={handleCreateTraining}
                disabled={!trainingForm.title.trim() || !trainingForm.date || trainingSaving}
                className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {trainingSaving ? t('clients', 'creating') : t('clients', 'createTraining')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Training Detail Modal ──────────────────────────────────────── */}
      {trainingDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{trainingDetail.title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {formatDate(trainingDetail.date)}
                    {trainingDetail.duration && <span> — {trainingDetail.duration} min</span>}
                  </p>
                </div>
                <button onClick={() => setTrainingDetail(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  trainingDetail.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  trainingDetail.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                }`}>{trainingDetail.status}</span>
                {trainingDetail.template && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Template: {trainingDetail.template.name}</span>
                )}
              </div>
              {trainingDetail.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{trainingDetail.description}</p>
                </div>
              )}
              {trainingDetail.attendees?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('clients', 'attendees')} ({trainingDetail.attendees.length})</p>
                  <div className="space-y-1">
                    {trainingDetail.attendees.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
                        <Avatar photo={null} name={a.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{a.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {trainingDetail.files?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('clients', 'filesSection')} ({trainingDetail.files.length})</p>
                  <div className="space-y-1">
                    {trainingDetail.files.map((f: any) => (
                      <div key={f.id} className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg px-3 py-1.5 text-sm">
                        <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        <span className="text-blue-700 dark:text-blue-300 font-medium">{f.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {trainingDetail.status === 'scheduled' && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={async () => {
                      await fetch(`/api/training/events/${trainingDetail.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'completed' }),
                      });
                      setClientTrainings(prev => prev.map(t => t.id === trainingDetail.id ? { ...t, status: 'completed' } : t));
                      setTrainingDetail({ ...trainingDetail, status: 'completed' });
                    }}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >{t('clients', 'markComplete')}</button>
                  <button
                    onClick={async () => {
                      await fetch(`/api/training/events/${trainingDetail.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'cancelled' }),
                      });
                      setClientTrainings(prev => prev.map(t => t.id === trainingDetail.id ? { ...t, status: 'cancelled' } : t));
                      setTrainingDetail({ ...trainingDetail, status: 'cancelled' });
                    }}
                    className="text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg transition-colors"
                  >{t('clients', 'deleteTraining')}</button>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end flex-shrink-0">
              <button onClick={() => setTrainingDetail(null)} className="btn-secondary text-sm">{t('common', 'close')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT with Suspense wrapper
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminBusinessesPage() {
  return (
    <Suspense fallback={<div className="p-6 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" /></div>}>
      <AdminBusinessesPageInner />
    </Suspense>
  );
}
