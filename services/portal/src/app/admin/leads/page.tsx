'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { useQuickBooks } from '@/lib/QuickBooksContext';
import PageHeader from '@/components/PageHeader';
import { topFuzzyMatches } from '@/lib/fuzzy';
import EndVisitModal from '@/components/EndVisitModal';
import CarriedOverMeetings from '@/components/CarriedOverMeetings';

// ── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  company: string | null;
  stage: LeadStage;
  source: LeadSource;
  assignedTo: { id: string; name: string; email: string } | null;
  assignedToId: string | null;
  managedClient: { id: string; displayName: string; companyName: string } | null;
  estimatedValue: number | null;
  nextFollowUpAt: string | null;
  notes: string | null;
  photo: string | null;
  lostReason: string | null;
  wonAt: string | null;
  lostAt: string | null;
  otherContacts: string | null;
  callbackReason: string | null;
  objective: string | null;
  budget: number | null;
  productsOfInterest: string | null;
  createdAt: string;
  updatedAt: string;
  projects: {
    id: string; name: string; status: string;
    callbackReason: string | null; suggestedProducts: string | null;
    objective: string | null; budget: number | null;
    quotes: { id: string; quoteNumber: string | null; status: string }[];
  }[];
  _count: { calls: number; visits: number; messages: number };
}

interface LeadCall {
  id: string;
  leadId: string;
  type: 'inbound' | 'outbound';
  outcome: string | null;
  duration: number | null;
  notes: string | null;
  calledAt: string;
  createdAt: string;
  loggedBy: { id: string; name: string } | null;
}

interface LeadVisit {
  id: string;
  leadId: string;
  visitorName: string;
  visitorEmail: string | null;
  visitorCompany: string | null;
  purpose: string | null;
  notes: string | null;
  visitedAt: string;
  createdAt: string;
  receivedBy: { id: string; name: string } | null;
}

interface LeadMessage {
  id: string;
  leadId: string;
  senderName: string;
  senderEmail: string | null;
  isFromClient: boolean;
  content: string;
  subject: string | null;
  sentAt: string;
  sender: { id: string; name: string } | null;
}

interface ProjectQuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit: string | null;
  notes: string | null;
  sortOrder: number;
}

interface ProjectQuote {
  id: string;
  quoteNumber: string | null;
  status: string;
  notes: string | null;
  parentQuoteId: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  items: ProjectQuoteItem[];
}

interface LeadProjectData {
  id: string;
  leadId: string;
  name: string;
  status: string;
  notes: string | null;
  createdAt: string;
  quotes: ProjectQuote[];
}

interface LeadActivity {
  id: string;
  leadId: string;
  type: string;
  description: string;
  actorName: string | null;
  fromStage: string | null;
  toStage: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

interface MeetingAttendee {
  id: string;
  meetingId: string;
  leadId: string | null;
  name: string | null;
  email: string | null;
  status: string;
  lead: { id: string; name: string; email: string | null; phone: string | null; company: string | null; photo: string | null } | null;
}

interface ProjectMeeting {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  location: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  attendees: MeetingAttendee[];
  createdBy: { id: string; name: string } | null;
}

interface LeadSearchResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  photo: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface QBItem {
  id: string;
  name: string;
  type?: string;
}

type LeadStage = 'new' | 'qualified' | 'demo_scheduled' | 'demo_done' | 'quote_sent' | 'negotiation' | 'won' | 'lost';
type LeadSource = 'walk_in' | 'inbound_call' | 'outbound_call' | 'referral' | 'web';

// ── Constants ────────────────────────────────────────────────────────────────

const STAGES: LeadStage[] = ['new', 'qualified', 'demo_scheduled', 'demo_done', 'quote_sent', 'negotiation', 'won', 'lost'];
const SOURCES: LeadSource[] = ['walk_in', 'inbound_call', 'outbound_call', 'referral', 'web'];

const STAGE_COLORS: Record<LeadStage, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  qualified: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  demo_scheduled: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  demo_done: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  quote_sent: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  negotiation: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  won: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  lost: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseProducts(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return d; }
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildCalendarDays(count: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminLeadsPage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  // Deep-link support: the People tab routes Edit clicks to
  // `/admin/leads?id=<leadId>` so Hugo lands directly on a specific lead's
  // detail panel. We read the param here and apply it once leads finish
  // loading (guarded by `appliedDeepLinkRef` so manually navigating away
  // from the lead doesn't re-select it on every render).
  const searchParams = useSearchParams();
  const deepLinkId = searchParams?.get('id') ?? null;
  const appliedDeepLinkRef = useRef(false);

  // ── Data state ──
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamMember[]>([]);
  // QB inventory is pulled from QuickBooksContext cache (prefetched + 60s refresh).
  const qb = useQuickBooks();
  const qbItems = qb.inventory.data as unknown as QBItem[];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'contact' | 'project'>('contact');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // ── List filters ──
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LeadStage | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'pipeline' | 'calendar'>('list');

  // ── Resizable columns ──
  const COL_KEYS = ['status', 'businessName', 'clientName', 'quotes', 'reasonOfCall', 'suggestedProducts', 'phone', 'email', 'objective', 'avgBudget'] as const;
  const COL_DEFAULTS: Record<string, number> = { status: 4, businessName: 12, clientName: 16, quotes: 6, reasonOfCall: 12, suggestedProducts: 12, phone: 9, email: 12, objective: 9, avgBudget: 6 };
  const [colWidths, setColWidths] = useState<Record<string, number>>(COL_DEFAULTS);
  const resizingCol = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const tableRef = useRef<HTMLTableElement>(null);

  const onResizeStart = useCallback((colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = colKey;
    resizeStartX.current = e.clientX;
    resizeStartW.current = colWidths[colKey] ?? COL_DEFAULTS[colKey];
    const tableW = tableRef.current?.offsetWidth ?? 1000;

    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const diffPx = ev.clientX - resizeStartX.current;
      const diffPct = (diffPx / tableW) * 100;
      const newW = Math.max(3, resizeStartW.current + diffPct);
      setColWidths(prev => ({ ...prev, [resizingCol.current!]: newW }));
    };
    const onUp = () => {
      resizingCol.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  // ── Detail panel form state ──
  const [detailForm, setDetailForm] = useState({
    name: '', email: '', phone: '', phone2: '', company: '',
    otherContacts: '', callbackReason: '', objective: '',
    budget: '', source: 'inbound_call' as LeadSource, stage: 'new' as LeadStage,
    assignedToId: '', estimatedValue: '', nextFollowUpAt: '', notes: '',
    productsOfInterest: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // ── Business linking state ──
  // Shape we normalise each ManagedClient row down to for the picker list.
  type BizPick = { id: string; name: string; companyName: string; source: string };
  // Cache the ManagedClient list so we can fuzzy-filter on EVERY keystroke
  // without re-hitting /api/managed-clients. Populated lazily on first focus
  // of the biz search input (see onFocus in the input below).
  const [bizClientsCache, setBizClientsCache] = useState<BizPick[] | null>(null);
  const [bizSearchQuery, setBizSearchQuery] = useState('');
  const [bizSearchResults, setBizSearchResults] = useState<BizPick[]>([]);
  const [bizSearching, setBizSearching] = useState(false);
  const [bizLinking, setBizLinking] = useState(false);

  // One-time fetch of all ManagedClients into memory so fuzzy search
  // runs instantly as Hugo types. Cache persists for the page lifetime.
  const ensureBizClientsLoaded = useCallback(async (): Promise<BizPick[]> => {
    if (bizClientsCache) return bizClientsCache;
    setBizSearching(true);
    try {
      const res = await fetch(`/api/managed-clients`);
      const data = await res.json();
      const clients = (data.clients || []) as any[];
      const normalised: BizPick[] = clients.map(mc => ({
        id: mc.id,
        name: mc.qbClient?.displayName || mc.displayName || '',
        companyName: mc.qbClient?.companyName || mc.companyName || '',
        source: 'quickbooks',
      }));
      setBizClientsCache(normalised);
      return normalised;
    } catch {
      setBizClientsCache([]);
      return [];
    } finally {
      setBizSearching(false);
    }
  }, [bizClientsCache]);

  // Fuzzy-on-change (Hugo's rule: 4–5 closest matches proactively, no
  // Enter key, no button press). See feedback_business_link_autocomplete.md.
  const handleBizSearch = async (q: string) => {
    setBizSearchQuery(q);
    if (!q.trim()) { setBizSearchResults([]); return; }
    const clients = await ensureBizClientsLoaded();
    const matches = topFuzzyMatches(
      q,
      clients,
      [mc => mc.companyName, mc => mc.name],
      { limit: 5, minFallback: 4 },
    );
    setBizSearchResults(matches);
  };

  const handleLinkBusiness = async (managedClientId: string) => {
    if (!selectedId) return;
    setBizLinking(true);
    try {
      await fetch(`/api/leads/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managedClientId }),
      });
      await fetchLeads();
      setBizSearchQuery('');
      setBizSearchResults([]);
    } catch { /* silently fail */ }
    setBizLinking(false);
  };

  const handleUnlinkBusiness = async () => {
    if (!selectedId) return;
    setBizLinking(true);
    try {
      await fetch(`/api/leads/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managedClientId: null }),
      });
      await fetchLeads();
    } catch { /* silently fail */ }
    setBizLinking(false);
  };

  const [projectForm, setProjectForm] = useState({
    name: '', callbackReason: '', suggestedProducts: '', objective: '', budget: '', notes: '',
  });

  // ── Detail tabs ──
  const [activeTab, setActiveTab] = useState<'projects' | 'activity' | 'calls' | 'visits' | 'messages'>('projects');
  const [calls, setCalls] = useState<LeadCall[]>([]);
  const [visits, setVisits] = useState<LeadVisit[]>([]);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // ── Projects & quotes state ──
  const [projects, setProjects] = useState<LeadProjectData[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewQuote, setShowNewQuote] = useState<string | null>(null); // projectId
  const [newQuoteItems, setNewQuoteItems] = useState<{ description: string; quantity: number; unitPrice: number; unit: string }[]>([{ description: '', quantity: 1, unitPrice: 0, unit: '' }]);
  const [duplicateModal, setDuplicateModal] = useState<{ quote: ProjectQuote; projectId: string } | null>(null);
  const [duplicateSelected, setDuplicateSelected] = useState<Set<string>>(new Set());
  const [projectSaving, setProjectSaving] = useState(false);

  // ── Log call form ──
  const [showCallForm, setShowCallForm] = useState(false);
  const [callForm, setCallForm] = useState({ type: 'outbound' as 'inbound' | 'outbound', clientType: 'new' as 'existing' | 'new', outcome: '', duration: '', notes: '' });
  const [callSaving, setCallSaving] = useState(false);

  // ── Log visit form ──
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitForm, setVisitForm] = useState({ visitorName: '', purpose: '', notes: '' });
  const [visitSaving, setVisitSaving] = useState(false);

  // ── Meetings ──
  const [meetings, setMeetings] = useState<ProjectMeeting[]>([]);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ title: '', scheduledAt: '', durationMinutes: '60', location: '', notes: '' });
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeResults, setAttendeeResults] = useState<LeadSearchResult[]>([]);
  const [attendeeSearching, setAttendeeSearching] = useState(false);
  const [addingAttendeeToMeeting, setAddingAttendeeToMeeting] = useState<string | null>(null); // meetingId currently adding to
  const [draggedLead, setDraggedLead] = useState<LeadSearchResult | null>(null);
  const [dragOverMeeting, setDragOverMeeting] = useState<string | null>(null);

  // ── Complete meeting modal ──
  const [completingMeetingId, setCompletingMeetingId] = useState<string | null>(null);
  const [selectedMainContactAttendeeId, setSelectedMainContactAttendeeId] = useState<string | null>(null);
  const [completingSaving, setCompletingSaving] = useState(false);

  // ── Send message ──
  const [messageBody, setMessageBody] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  // ── New lead modal ──
  const [showNewLead, setShowNewLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    name: '', email: '', phone: '', phone2: '', company: '',
    source: 'inbound_call' as LeadSource, notes: '',
    callbackReason: '', objective: '', budget: '',
  });
  const [newLeadSaving, setNewLeadSaving] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Derived ──
  const selectedLead = leads.find(l => l.id === selectedId) ?? null;

  // ── Fetch leads ──
  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (data.leads) setLeads(data.leads);
    } catch { /* silently fail */ }
    setLoading(false);
  };

  // ── Fetch team ──
  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/admin/team');
      const data = await res.json();
      if (data.members) setTeam(data.members);
      else if (Array.isArray(data)) setTeam(data);
    } catch {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        if (data.users) setTeam(data.users);
        else if (Array.isArray(data)) setTeam(data);
      } catch { /* silently fail */ }
    }
  };

  // QB inventory handled by QuickBooksContext — fetch only the local data here.
  useEffect(() => {
    fetchLeads();
    fetchTeam();
  }, []);

  // Apply ?id=<leadId> deep link once leads are loaded. We only run this
  // once per mount: if Hugo then clicks into a different lead the URL stays
  // put but we don't keep forcing it back to the deep-linked one.
  useEffect(() => {
    if (appliedDeepLinkRef.current) return;
    if (!deepLinkId) return;
    if (leads.length === 0) return;
    const match = leads.find(l => l.id === deepLinkId);
    if (match) {
      setSelectedId(match.id);
      setEditMode('contact');
      appliedDeepLinkRef.current = true;
    }
  }, [deepLinkId, leads]);

  // ── Populate detail form when selected lead changes ──
  useEffect(() => {
    if (selectedLead) {
      setDetailForm({
        name: selectedLead.name || '',
        email: selectedLead.email || '',
        phone: selectedLead.phone || '',
        phone2: selectedLead.phone2 || '',
        company: selectedLead.company || '',
        otherContacts: selectedLead.otherContacts || '',
        callbackReason: selectedLead.callbackReason || '',
        objective: selectedLead.objective || '',
        budget: selectedLead.budget != null ? String(selectedLead.budget) : '',
        source: selectedLead.source,
        stage: selectedLead.stage,
        assignedToId: selectedLead.assignedTo?.id ?? '',
        estimatedValue: selectedLead.estimatedValue != null ? String(selectedLead.estimatedValue) : '',
        nextFollowUpAt: selectedLead.nextFollowUpAt ? selectedLead.nextFollowUpAt.slice(0, 10) : '',
        notes: selectedLead.notes || '',
        productsOfInterest: parseProducts(selectedLead.productsOfInterest),
      });
      setActiveTab('projects');
      loadTabData('projects', selectedLead.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Populate projectForm when selectedProjectId changes ──
  useEffect(() => {
    if (selectedProjectId && selectedLead) {
      const proj = selectedLead.projects?.find(p => p.id === selectedProjectId);
      if (proj) {
        setProjectForm({
          name: proj.name || '',
          callbackReason: proj.callbackReason || '',
          suggestedProducts: proj.suggestedProducts || '',
          objective: proj.objective || '',
          budget: proj.budget != null ? String(proj.budget) : '',
          notes: '',
        });
        // Also load full project data for quotes
        loadTabData('projects', selectedLead.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  // ── Load tab data ──
  const loadTabData = async (tab: string, leadId: string) => {
    setTabLoading(true);
    try {
      if (tab === 'projects') {
        const res = await fetch(`/api/leads/${leadId}/projects`);
        const data = await res.json();
        setProjects(data.projects ?? []);
      } else {
        const res = await fetch(`/api/leads/${leadId}/${tab}`);
        const data = await res.json();
        if (tab === 'calls') setCalls(data.calls ?? []);
        if (tab === 'visits') setVisits(data.visits ?? []);
        if (tab === 'messages') setMessages(data.messages ?? []);
        if (tab === 'activity') setActivities(data.activities ?? []);
      }
    } catch { /* silently fail */ }
    setTabLoading(false);
  };

  // ── Project & Quote actions ──
  const handleCreateProject = async () => {
    if (!selectedId || !newProjectName.trim()) return;
    setProjectSaving(true);
    try {
      const res = await fetch(`/api/leads/${selectedId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        setNewProjectName('');
        setShowNewProject(false);
        loadTabData('projects', selectedId);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Create project failed:', res.status, err);
        alert(`Error: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error('Create project exception:', e);
    }
    setProjectSaving(false);
  };

  const handleCreateQuote = async (projectId: string) => {
    setProjectSaving(true);
    try {
      const validItems = newQuoteItems.filter(i => i.description.trim());
      const res = await fetch(`/api/projects/${projectId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: validItems }),
      });
      if (res.ok && selectedId) {
        setShowNewQuote(null);
        setNewQuoteItems([{ description: '', quantity: 1, unitPrice: 0, unit: '' }]);
        loadTabData('projects', selectedId);
      }
    } catch { /* */ }
    setProjectSaving(false);
  };

  const handleDeleteQuoteItem = async (projectId: string, quoteId: string, itemId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/quotes/${quoteId}/items/${itemId}`, { method: 'DELETE' });
      if (selectedId) loadTabData('projects', selectedId);
    } catch { /* */ }
  };

  const handleDuplicateQuote = async () => {
    if (!duplicateModal || !selectedId) return;
    setProjectSaving(true);
    try {
      const itemIds = Array.from(duplicateSelected);
      await fetch(`/api/projects/${duplicateModal.projectId}/quotes/${duplicateModal.quote.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: itemIds.length > 0 ? itemIds : undefined }),
      });
      setDuplicateModal(null);
      setDuplicateSelected(new Set());
      loadTabData('projects', selectedId);
    } catch { /* */ }
    setProjectSaving(false);
  };

  const handleRefuseProject = async (projectId: string) => {
    if (!confirm(t('leads', 'refuseProjectConfirm'))) return;
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'lost', refuseAllQuotes: true }),
      });
      if (selectedId) loadTabData('projects', selectedId);
    } catch { /* */ }
  };

  useEffect(() => {
    if (selectedLead) loadTabData(activeTab, selectedLead.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'messages' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  // ── Filtered leads ──
  const filtered = useMemo(() => leads.filter(l => {
    if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
    if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.name.toLowerCase().includes(q)
        || (l.email || '').toLowerCase().includes(q)
        || (l.company || '').toLowerCase().includes(q)
        || (l.callbackReason || '').toLowerCase().includes(q);
    }
    return true;
  }), [leads, stageFilter, sourceFilter, search]);

  // ── Calendar data ──
  const calendarDays = useMemo(() => buildCalendarDays(60), []);
  const calendarMap = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const lead of filtered) {
      if (lead.nextFollowUpAt) {
        const key = lead.nextFollowUpAt.slice(0, 10);
        if (!map[key]) map[key] = [];
        map[key].push(lead);
      }
    }
    return map;
  }, [filtered]);

  // ── Save contact-level fields ──
  const handleSaveContact = async () => {
    if (!selectedLead) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: detailForm.name,
          email: detailForm.email || null,
          phone: detailForm.phone || null,
          phone2: detailForm.phone2 || null,
          company: detailForm.company || null,
          otherContacts: detailForm.otherContacts || null,
          source: detailForm.source,
        }),
      });
      await fetchLeads();
    } catch { /* silently fail */ }
    setSaving(false);
  };

  // ── Save project-level fields ──
  const handleSaveProject = async () => {
    if (!selectedLead || !selectedProjectId) return;
    setSaving(true);
    try {
      // PATCH project-level fields
      await fetch(`/api/projects/${selectedProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectForm.name || undefined,
          callbackReason: projectForm.callbackReason || null,
          suggestedProducts: projectForm.suggestedProducts || null,
          objective: projectForm.objective || null,
          budget: projectForm.budget ? parseFloat(projectForm.budget) : null,
          notes: projectForm.notes || null,
        }),
      });
      // PATCH lead-level fields edited from project context
      await fetch(`/api/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: detailForm.stage,
          assignedToId: detailForm.assignedToId || null,
          estimatedValue: detailForm.estimatedValue ? parseFloat(detailForm.estimatedValue) : null,
          nextFollowUpAt: detailForm.nextFollowUpAt || null,
          productsOfInterest: detailForm.productsOfInterest.length > 0
            ? JSON.stringify(detailForm.productsOfInterest) : null,
        }),
      });
      await fetchLeads();
      if (selectedLead) loadTabData('projects', selectedLead.id);
    } catch { /* silently fail */ }
    setSaving(false);
  };

  // ── Legacy handleSave (kept for backward compat) ──
  const handleSave = async () => {
    if (editMode === 'project') {
      await handleSaveProject();
    } else {
      await handleSaveContact();
    }
  };

  // ── Create new lead ──
  const handleCreateLead = async () => {
    setNewLeadSaving(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newLeadForm,
          budget: newLeadForm.budget ? parseFloat(newLeadForm.budget) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewLead(false);
        setNewLeadForm({ name: '', email: '', phone: '', phone2: '', company: '', source: 'inbound_call', notes: '', callbackReason: '', objective: '', budget: '' });
        await fetchLeads();
        if (data.lead?.id) setSelectedId(data.lead.id);
      }
    } catch { /* silently fail */ }
    setNewLeadSaving(false);
  };

  // ── Log call ──
  const handleLogCall = async () => {
    if (!selectedLead) return;
    setCallSaving(true);
    try {
      await fetch(`/api/leads/${selectedLead.id}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: callForm.type,
          clientType: callForm.clientType,
          outcome: callForm.outcome,
          duration: callForm.duration ? parseInt(callForm.duration, 10) : null,
          notes: callForm.notes,
        }),
      });
      setShowCallForm(false);
      setCallForm({ type: 'outbound', clientType: 'new', outcome: '', duration: '', notes: '' });
      loadTabData('calls', selectedLead.id);
      fetchLeads();
    } catch { /* silently fail */ }
    setCallSaving(false);
  };

  // ── Log visit ──
  const handleLogVisit = async () => {
    if (!selectedLead || !visitForm.visitorName.trim()) return;
    setVisitSaving(true);
    try {
      await fetch(`/api/leads/${selectedLead.id}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorName: visitForm.visitorName.trim(),
          purpose: visitForm.purpose || null,
          notes: visitForm.notes || null,
        }),
      });
      setShowVisitForm(false);
      setVisitForm({ visitorName: '', purpose: '', notes: '' });
      loadTabData('visits', selectedLead.id);
      fetchLeads();
    } catch { /* silently fail */ }
    setVisitSaving(false);
  };

  // ── Meetings ──
  const loadMeetings = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/meetings`);
      const data = await res.json();
      setMeetings(data.meetings ?? []);
    } catch { setMeetings([]); }
  }, []);

  // Load meetings when project is selected
  useEffect(() => {
    if (selectedProjectId && editMode === 'project') {
      loadMeetings(selectedProjectId);
    } else {
      setMeetings([]);
    }
  }, [selectedProjectId, editMode, loadMeetings]);

  const handleCreateMeeting = async () => {
    if (!selectedProjectId || !meetingForm.title.trim() || !meetingForm.scheduledAt) return;
    setMeetingSaving(true);
    try {
      await fetch(`/api/projects/${selectedProjectId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meetingForm.title.trim(),
          scheduledAt: meetingForm.scheduledAt,
          durationMinutes: parseInt(meetingForm.durationMinutes, 10) || 60,
          location: meetingForm.location || null,
          notes: meetingForm.notes || null,
        }),
      });
      setShowMeetingForm(false);
      setMeetingForm({ title: '', scheduledAt: '', durationMinutes: '60', location: '', notes: '' });
      loadMeetings(selectedProjectId);
    } catch { /* silently fail */ }
    setMeetingSaving(false);
  };

  const handleAddAttendee = async (meetingId: string, lead: LeadSearchResult) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (res.ok && selectedProjectId) {
        loadMeetings(selectedProjectId);
      }
    } catch { /* silently fail */ }
  };

  const handleRemoveAttendee = async (meetingId: string, attendeeId: string) => {
    try {
      await fetch(`/api/meetings/${meetingId}/attendees?attendeeId=${attendeeId}`, { method: 'DELETE' });
      if (selectedProjectId) loadMeetings(selectedProjectId);
    } catch { /* silently fail */ }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
      if (selectedProjectId) loadMeetings(selectedProjectId);
    } catch { /* silently fail */ }
  };

  const handleCompleteMeeting = (meetingId: string) => {
    // Open the main-contact selection modal instead of completing directly
    const mtg = meetings.find(m => m.id === meetingId);
    if (!mtg) return;

    // Auto-select if an attendee is already the project's lead (main contact)
    const preSelected = mtg.attendees.find(a => a.leadId && a.leadId === selectedId);
    setSelectedMainContactAttendeeId(preSelected?.id ?? null);
    setCompletingMeetingId(meetingId);
  };

  const confirmCompleteMeeting = async () => {
    if (!completingMeetingId || !selectedMainContactAttendeeId) return;
    setCompletingSaving(true);
    try {
      const res = await fetch(`/api/meetings/${completingMeetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', mainContactAttendeeId: selectedMainContactAttendeeId }),
      });
      if (res.ok) {
        setCompletingMeetingId(null);
        setSelectedMainContactAttendeeId(null);
        if (selectedProjectId) loadMeetings(selectedProjectId);
        // Refresh leads in case the main contact changed
        fetchLeads();
      }
    } catch { /* silently fail */ }
    setCompletingSaving(false);
  };

  // Search leads for attendee assignment
  useEffect(() => {
    if (attendeeSearch.length < 2) { setAttendeeResults([]); return; }
    const timeout = setTimeout(async () => {
      setAttendeeSearching(true);
      try {
        const res = await fetch(`/api/leads/search?q=${encodeURIComponent(attendeeSearch)}`);
        const data = await res.json();
        setAttendeeResults(data.leads ?? []);
      } catch { setAttendeeResults([]); }
      setAttendeeSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [attendeeSearch]);

  // Drag & drop handler
  const handleDropOnMeeting = async (meetingId: string) => {
    if (!draggedLead) return;
    await handleAddAttendee(meetingId, draggedLead);
    setDraggedLead(null);
    setDragOverMeeting(null);
  };

  // ── Send message ──
  const handleSendMessage = async () => {
    if (!selectedLead || !messageBody.trim()) return;
    setMessageSending(true);
    try {
      await fetch(`/api/leads/${selectedLead.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageBody.trim() }),
      });
      setMessageBody('');
      loadTabData('messages', selectedLead.id);
    } catch { /* silently fail */ }
    setMessageSending(false);
  };

  // ── Toggle product selection ──
  const toggleProduct = (productName: string) => {
    setDetailForm(prev => {
      const list = prev.productsOfInterest;
      return {
        ...prev,
        productsOfInterest: list.includes(productName)
          ? list.filter(p => p !== productName)
          : [...list, productName],
      };
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SUB-RENDERS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Table View ──
  const renderTable = () => {
    if (filtered.length === 0) {
      return <div className="text-center text-gray-400 dark:text-gray-500 py-16 text-sm">{t('leads', 'noLeads')}</div>;
    }

    const openContact = (leadId: string) => {
      setSelectedId(leadId);
      setEditMode('contact');
      setSelectedProjectId(null);
    };

    const openProject = (leadId: string, projectId: string) => {
      setSelectedId(leadId);
      setEditMode('project');
      setSelectedProjectId(projectId);
    };

    return (
      <div className="bg-white dark:bg-gray-800 overflow-hidden">
        <table ref={tableRef} className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="border-b-[3px] border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-900">
              {[
                { key: 'status', label: t('leads', 'status'), align: 'center' },
                { key: 'businessName', label: t('leads', 'businessName'), align: 'left' },
                { key: 'clientName', label: t('leads', 'clientName'), align: 'left' },
                { key: 'quotes', label: t('leads', 'quotes'), align: 'center' },
                { key: 'reasonOfCall', label: t('leads', 'reasonOfCall'), align: 'left' },
                { key: 'suggestedProducts', label: t('leads', 'suggestedProducts'), align: 'left' },
                { key: 'phone', label: t('leads', 'phone'), align: 'left' },
                { key: 'email', label: t('leads', 'email'), align: 'left' },
                { key: 'objective', label: t('leads', 'objective'), align: 'left' },
                { key: 'avgBudget', label: t('leads', 'avgBudget'), align: 'right' },
              ].map(col => (
                <th
                  key={col.key}
                  style={{ width: `${colWidths[col.key]}%`, position: 'relative', overflow: 'hidden' }}
                  className={`px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 select-none ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {col.label}
                  {/* Resize handle */}
                  <span
                    onMouseDown={e => onResizeStart(col.key, e)}
                    className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-400/40 transition-colors"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead, leadIdx) => {
              const activeProjects = lead.projects?.filter(p => p.status === 'active') ?? [];
              const totalQuotes = activeProjects.reduce((sum, p) => sum + p.quotes.length, 0);
              const rowCls = `cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition`;
              const contactSelected = selectedId === lead.id && editMode === 'contact' ? 'bg-blue-50/60 dark:bg-blue-900/15' : '';

              // ── Row 1: Contact row (tree root — folder icon) ──
              const contactRow = (
                <tr
                  key={`${lead.id}-contact`}
                  onClick={() => openContact(lead.id)}
                  className={`${rowCls} ${contactSelected}${leadIdx > 0 ? ' border-t-[3px] border-gray-300 dark:border-gray-600' : ''}`}
                >
                  <td className="px-4 py-3 text-center overflow-hidden" />
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 overflow-hidden">
                    <span className="block truncate">{lead.company || '-'}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 overflow-hidden">
                    <div className="flex items-center gap-2">
                      {/* Person icon */}
                      <svg className="w-5 h-5 flex-shrink-0 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
                      </svg>
                      <span className="truncate font-semibold">{lead.name}</span>
                      <span className={`flex-shrink-0 inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STAGE_COLORS[lead.stage]}`}>
                        {t('leads', `stage_${lead.stage}`)}
                      </span>
                      {activeProjects.length > 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">({activeProjects.length})</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400 overflow-hidden">
                    <span className="block truncate">{totalQuotes > 0 ? totalQuotes : '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 overflow-hidden">
                    <span className="block truncate">{activeProjects.length === 0 ? (lead.callbackReason || '-') : '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 overflow-hidden">
                    <span className="block truncate">{activeProjects.length === 0 ? (() => { const arr = parseProducts(lead.productsOfInterest); return arr.length > 0 ? arr.join(', ') : '-'; })() : '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 overflow-hidden">
                    <span className="block truncate">{lead.phone || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 overflow-hidden">
                    <span className="block truncate">{lead.email || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 overflow-hidden">
                    <span className="block truncate">{activeProjects.length === 0 ? (lead.objective || '-') : '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 overflow-hidden">
                    <span className="block truncate">{activeProjects.length === 0 ? (lead.budget != null ? `$${lead.budget.toLocaleString()}` : '-') : '-'}</span>
                  </td>
                </tr>
              );

              // ── Row 2+: Project rows (tree children — with connector lines) ──
              const projectRows = activeProjects.map((proj, projIdx) => {
                const prodArr = parseProducts(proj.suggestedProducts);
                const projSelected = selectedId === lead.id && editMode === 'project' && selectedProjectId === proj.id ? 'bg-blue-50/60 dark:bg-blue-900/15' : '';
                const isLast = projIdx === activeProjects.length - 1;
                return (
                  <tr
                    key={`${lead.id}-proj-${proj.id}`}
                    onClick={(e) => { e.stopPropagation(); openProject(lead.id, proj.id); }}
                    className={`${rowCls} ${projSelected}`}
                  >
                    <td className="px-4 py-2 text-center overflow-hidden" />
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 overflow-hidden" />
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300 overflow-hidden">
                      <div className="flex items-center text-[12px]">
                        {/* Tree connector: ├── or └── */}
                        <span className="flex-shrink-0 w-8 flex items-center text-gray-300 dark:text-gray-600 font-mono select-none" style={{ marginLeft: 6 }}>
                          {isLast ? (
                            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M6 2v8h8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M6 2v16M6 10h8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        {/* Clipboard/project icon */}
                        <svg className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400 mr-1.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6a1 1 0 011 1v1H8V3a1 1 0 011-1zM7 4h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                          <path strokeLinecap="round" d="M9 10h2M9 13h2M9 16h2" />
                          <rect x="7.5" y="9.5" width="1.5" height="1.5" rx="0.25" stroke="none" fill="currentColor" />
                          <rect x="7.5" y="12.5" width="1.5" height="1.5" rx="0.25" stroke="none" fill="currentColor" />
                          <rect x="7.5" y="15.5" width="1.5" height="1.5" rx="0.25" stroke="none" fill="currentColor" />
                        </svg>
                        <span className="truncate">{proj.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600 dark:text-gray-400 overflow-hidden">
                      <span className="block truncate">{proj.quotes.length > 0 ? proj.quotes.length : '-'}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 overflow-hidden">
                      <span className="block truncate">{proj.callbackReason || '-'}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 overflow-hidden">
                      <span className="block truncate">{prodArr.length > 0 ? prodArr.join(', ') : '-'}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 overflow-hidden" />
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 overflow-hidden" />
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 overflow-hidden">
                      <span className="block truncate">{proj.objective || '-'}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400 overflow-hidden">
                      <span className="block truncate">{proj.budget != null ? `$${proj.budget.toLocaleString()}` : '-'}</span>
                    </td>
                  </tr>
                );
              });

              return [contactRow, ...projectRows];
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Pipeline Kanban View ──
  const renderPipeline = () => {
    const stageGroups = STAGES.map(stage => ({
      stage,
      leads: filtered.filter(l => l.stage === stage),
    }));

    return (
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[60vh]">
        {stageGroups.map(({ stage, leads: stageLeads }) => (
          <div key={stage} className="flex-shrink-0 w-64 bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[stage]}`}>
                {t('leads', `stage_${stage}`)}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{stageLeads.length}</span>
            </div>
            <div className="space-y-2">
              {stageLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`w-full text-left bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-3 hover:shadow-md transition ${
                    selectedId === lead.id ? 'ring-2 ring-brand-600' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{lead.name}</p>
                  {lead.company && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{lead.company}</p>}
                  {lead.estimatedValue != null && (
                    <p className="text-xs font-medium text-brand-600 dark:text-brand-400 mt-1">${lead.estimatedValue.toLocaleString()}</p>
                  )}
                </button>
              ))}
              {stageLeads.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">{t('leads', 'noLeads')}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Calendar View ──
  const renderCalendar = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = dateKey(today);

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('leads', 'followUpCalendar')}</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('leads', 'calendarNext60')}</p>
        </div>
        <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700">
            {/* Day-of-week headers */}
            {(['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat'] as const).map(k => (
              <div key={k} className="bg-gray-50 dark:bg-gray-900 px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-center">{t('leads', k)}</div>
            ))}
            {/* Leading empty cells to align first day */}
            {Array.from({ length: calendarDays[0]?.getDay() ?? 0 }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-white dark:bg-gray-800 min-h-[80px]" />
            ))}
            {calendarDays.map(day => {
              const key = dateKey(day);
              const dayLeads = calendarMap[key] || [];
              const isToday = key === todayStr;
              return (
                <div
                  key={key}
                  className={`bg-white dark:bg-gray-800 min-h-[80px] p-1.5 ${isToday ? 'ring-2 ring-inset ring-brand-500' : ''}`}
                >
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {day.getDate()}
                    {day.getDate() === 1 && (
                      <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-500">
                        {day.toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayLeads.map(lead => (
                      <button
                        key={lead.id}
                        onClick={() => setSelectedId(lead.id)}
                        className="block w-full text-left px-1 py-0.5 rounded text-[10px] font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 dark:hover:bg-brand-900/50 truncate transition"
                        title={lead.name}
                      >
                        {lead.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Detail Panel (slide-in from right) ──
  const renderDetailPanel = () => {
    if (!selectedLead) return null;

    const currentProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null;

    // ── Shared activity tabs (calls, visits, messages) ──
    const renderActivityTabs = () => (
      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
        <div className="flex border-b dark:border-gray-700">
          {(['activity', 'calls', 'visits', 'messages'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium text-center transition border-b-2 ${
                activeTab === tab
                  ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('leads', tab)}
            </button>
          ))}
        </div>

        <div className="p-4 min-h-[250px]">
          {tabLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
            </div>
          ) : (
            <>
              {/* ── Activity Tab ── */}
              {activeTab === 'activity' && (
                <div className="space-y-3">
                  {activities.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">{t('leads', 'noActivity')}</p>
                  ) : (
                    <div className="relative pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
                      {activities.map(act => (
                        <div key={act.id} className="relative">
                          <div className={`absolute -left-[21px] w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                            act.type === 'stage_change' ? 'bg-brand-600' :
                            act.type === 'call_logged' ? 'bg-blue-500' :
                            act.type === 'visit_logged' ? 'bg-orange-500' :
                            act.type === 'message_sent' ? 'bg-green-500' :
                            act.type === 'assignment_change' ? 'bg-purple-500' :
                            'bg-gray-400'
                          }`} />
                          <div className="ml-2">
                            <p className="text-sm text-gray-700 dark:text-gray-300">{act.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(act.createdAt)}</span>
                              {(act.actorName || act.actor?.name) && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">{act.actorName || act.actor?.name}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Calls Tab ── */}
              {activeTab === 'calls' && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowCallForm(!showCallForm)}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700 transition"
                    >
                      {showCallForm ? t('leads', 'cancel') : t('leads', 'logCall')}
                    </button>
                  </div>

                  {showCallForm && (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3 border dark:border-gray-700">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'callType')}</label>
                          <select value={callForm.type} onChange={e => setCallForm({ ...callForm, type: e.target.value as 'inbound' | 'outbound' })} className={INPUT_CLS}>
                            <option value="outbound">{t('leads', 'callOutbound')}</option>
                            <option value="inbound">{t('leads', 'callInbound')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'clientType')}</label>
                          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setCallForm({ ...callForm, clientType: 'new' })}
                              className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                                callForm.clientType === 'new' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                            >
                              {t('leads', 'clientNew')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCallForm({ ...callForm, clientType: 'existing' })}
                              className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                                callForm.clientType === 'existing' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                            >
                              {t('leads', 'clientExisting')}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'callDuration')}</label>
                        <input type="number" placeholder={t('leads', 'durationSeconds')} value={callForm.duration} onChange={e => setCallForm({ ...callForm, duration: e.target.value })} className={INPUT_CLS} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'callOutcome')}</label>
                        <input type="text" value={callForm.outcome} onChange={e => setCallForm({ ...callForm, outcome: e.target.value })} className={INPUT_CLS} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'notes')}</label>
                        <textarea value={callForm.notes} onChange={e => setCallForm({ ...callForm, notes: e.target.value })} rows={2} className={`${INPUT_CLS} resize-none`} />
                      </div>
                      <div className="flex justify-end">
                        <button onClick={handleLogCall} disabled={callSaving} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50">
                          {callSaving ? t('leads', 'saving') : t('leads', 'logCall')}
                        </button>
                      </div>
                    </div>
                  )}

                  {calls.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">{t('leads', 'noCalls')}</p>
                  ) : (
                    calls.map(call => (
                      <div key={call.id} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border dark:border-gray-700">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              call.type === 'inbound' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>
                              {t('leads', `call${call.type.charAt(0).toUpperCase() + call.type.slice(1)}`)}
                            </span>
                            {(call as any).clientType && (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                (call as any).clientType === 'existing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                              }`}>
                                {(call as any).clientType === 'existing' ? t('leads', 'clientExisting') : t('leads', 'clientNew')}
                              </span>
                            )}
                            {call.outcome && <span className="text-xs text-gray-600 dark:text-gray-400">{call.outcome}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                            {call.duration != null && <span>{formatDuration(call.duration)}</span>}
                            <span>{formatDate(call.calledAt)}</span>
                          </div>
                        </div>
                        {call.notes && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{call.notes}</p>}
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{call.loggedBy?.name || ''}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Visits Tab ── */}
              {activeTab === 'visits' && (
                <div className="space-y-4">

                  {/* Carried-over meetings (from previous days) — appears
                      only when there's something unfinished. Click an
                      item to reopen the finalize modal. Added 2026-04-20. */}
                  <CarriedOverMeetings />

                  {/* ── Meetings Section ── */}
                  {editMode === 'project' && selectedProjectId && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('leads', 'meetings')}</h4>
                        <button
                          onClick={() => setShowMeetingForm(!showMeetingForm)}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700 transition"
                        >
                          {showMeetingForm ? t('leads', 'cancel') : `+ ${t('leads', 'newMeeting')}`}
                        </button>
                      </div>

                      {/* New meeting form */}
                      {showMeetingForm && (
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3 border dark:border-gray-700">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'meetingTitle')}</label>
                            <input type="text" value={meetingForm.title} onChange={e => setMeetingForm({ ...meetingForm, title: e.target.value })} className={INPUT_CLS} placeholder={t('leads', 'meetingTitlePlaceholder')} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'meetingDate')}</label>
                              <input type="datetime-local" value={meetingForm.scheduledAt} onChange={e => setMeetingForm({ ...meetingForm, scheduledAt: e.target.value })} className={INPUT_CLS} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'meetingDuration')}</label>
                              <select value={meetingForm.durationMinutes} onChange={e => setMeetingForm({ ...meetingForm, durationMinutes: e.target.value })} className={INPUT_CLS}>
                                <option value="15">15 min</option>
                                <option value="30">30 min</option>
                                <option value="45">45 min</option>
                                <option value="60">1h</option>
                                <option value="90">1h30</option>
                                <option value="120">2h</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'meetingLocation')}</label>
                            <input type="text" value={meetingForm.location} onChange={e => setMeetingForm({ ...meetingForm, location: e.target.value })} className={INPUT_CLS} placeholder={t('leads', 'meetingLocationPlaceholder')} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'notes')}</label>
                            <textarea value={meetingForm.notes} onChange={e => setMeetingForm({ ...meetingForm, notes: e.target.value })} rows={2} className={`${INPUT_CLS} resize-none`} />
                          </div>
                          <div className="flex justify-end">
                            <button onClick={handleCreateMeeting} disabled={meetingSaving || !meetingForm.title.trim() || !meetingForm.scheduledAt} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50">
                              {meetingSaving ? t('leads', 'saving') : t('leads', 'createMeeting')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Meeting cards */}
                      {meetings.length === 0 && !showMeetingForm ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('leads', 'noMeetings')}</p>
                      ) : (
                        meetings.map(mtg => (
                          <div
                            key={mtg.id}
                            className={`bg-gray-50 dark:bg-gray-900 rounded-lg border dark:border-gray-700 overflow-hidden transition ${
                              dragOverMeeting === mtg.id ? 'ring-2 ring-brand-500 border-brand-500' : ''
                            }`}
                            onDragOver={e => { e.preventDefault(); setDragOverMeeting(mtg.id); }}
                            onDragLeave={() => setDragOverMeeting(null)}
                            onDrop={e => { e.preventDefault(); handleDropOnMeeting(mtg.id); }}
                          >
                            {/* Meeting header */}
                            <div className="px-3 py-2 flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                  mtg.status === 'completed' ? 'bg-green-500' : mtg.status === 'cancelled' ? 'bg-red-400' : 'bg-blue-500'
                                }`} />
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{mtg.title}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                  mtg.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  mtg.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                }`}>
                                  {t('leads', `meetingStatus_${mtg.status}`)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {mtg.status === 'scheduled' && (
                                  <button onClick={() => handleCompleteMeeting(mtg.id)} className="text-[10px] text-green-600 hover:text-green-700 px-1" title={t('leads', 'completeMeeting')}>✓</button>
                                )}
                                <button onClick={() => handleDeleteMeeting(mtg.id)} className="text-[10px] text-red-400 hover:text-red-600 px-1" title={t('leads', 'deleteMeeting')}>✕</button>
                              </div>
                            </div>

                            {/* Meeting details */}
                            <div className="px-3 pb-2 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                              <span>{new Date(mtg.scheduledAt).toLocaleDateString()} {new Date(mtg.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span>{mtg.durationMinutes} min</span>
                              {mtg.location && <span>{mtg.location}</span>}
                            </div>

                            {/* Attendees */}
                            <div className="px-3 pb-2 space-y-1">
                              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase">{t('leads', 'attendees')} ({mtg.attendees.length})</p>
                              {mtg.attendees.length === 0 ? (
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">{t('leads', 'noAttendees')}</p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {mtg.attendees.map(att => {
                                    const isMain = att.leadId && att.leadId === selectedId;
                                    return (
                                      <span key={att.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${isMain ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 ring-1 ring-green-400' : 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'}`}>
                                        {att.lead?.name || att.name || '?'}
                                        {isMain && <span className="text-[8px] font-bold ml-0.5">{t('leads', 'mainContact')}</span>}
                                        <button onClick={() => handleRemoveAttendee(mtg.id, att.id)} className="text-brand-400 hover:text-brand-600">
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Add attendee inline */}
                              {addingAttendeeToMeeting === mtg.id ? (
                                <div className="mt-1">
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={attendeeSearch}
                                      onChange={e => setAttendeeSearch(e.target.value)}
                                      className={`${INPUT_CLS} text-xs`}
                                      placeholder={t('leads', 'searchAttendee')}
                                      autoFocus
                                    />
                                    {attendeeSearching && <div className="absolute right-2 top-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-600" /></div>}
                                  </div>
                                  {attendeeResults.length > 0 && (
                                    <div className="mt-1 border dark:border-gray-600 rounded-lg max-h-32 overflow-y-auto bg-white dark:bg-gray-800">
                                      {attendeeResults.map(lead => {
                                        const alreadyAdded = mtg.attendees.some(a => a.leadId === lead.id);
                                        return (
                                          <button
                                            key={lead.id}
                                            disabled={alreadyAdded}
                                            onClick={() => { handleAddAttendee(mtg.id, lead); setAttendeeSearch(''); setAttendeeResults([]); }}
                                            draggable
                                            onDragStart={() => setDraggedLead(lead)}
                                            onDragEnd={() => setDraggedLead(null)}
                                            className={`w-full px-2 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                                          >
                                            <span className="font-medium text-gray-800 dark:text-gray-200">{lead.name}</span>
                                            {lead.company && <span className="text-gray-400 dark:text-gray-500">{lead.company}</span>}
                                            {alreadyAdded && <span className="text-[10px] text-gray-400 ml-auto">✓</span>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <button onClick={() => { setAddingAttendeeToMeeting(null); setAttendeeSearch(''); setAttendeeResults([]); }} className="mt-1 text-[11px] text-gray-400 hover:text-gray-600">{t('leads', 'cancel')}</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAddingAttendeeToMeeting(mtg.id)}
                                  className="text-[11px] text-brand-600 hover:text-brand-700 font-medium mt-1"
                                >
                                  + {t('leads', 'addAttendee')}
                                </button>
                              )}
                            </div>

                            {mtg.notes && <div className="px-3 pb-2"><p className="text-[11px] text-gray-500 dark:text-gray-400">{mtg.notes}</p></div>}
                          </div>
                        ))
                      )}

                      <hr className="border-gray-200 dark:border-gray-700" />
                    </div>
                  )}

                  {/* ── Walk-in Visits Section ── */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('leads', 'walkInVisits')}</h4>
                      <button
                        onClick={() => setShowVisitForm(!showVisitForm)}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700 transition"
                      >
                        {showVisitForm ? t('leads', 'cancel') : t('leads', 'logVisit')}
                      </button>
                    </div>

                    {showVisitForm && (
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3 border dark:border-gray-700">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'visitorName')}</label>
                          <input type="text" value={visitForm.visitorName} onChange={e => setVisitForm({ ...visitForm, visitorName: e.target.value })} className={INPUT_CLS} placeholder={t('leads', 'visitorNamePlaceholder')} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'visitPurpose')}</label>
                          <input type="text" value={visitForm.purpose} onChange={e => setVisitForm({ ...visitForm, purpose: e.target.value })} className={INPUT_CLS} placeholder={t('leads', 'visitPurposePlaceholder')} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'notes')}</label>
                          <textarea value={visitForm.notes} onChange={e => setVisitForm({ ...visitForm, notes: e.target.value })} rows={2} className={`${INPUT_CLS} resize-none`} />
                        </div>
                        <div className="flex justify-end">
                          <button onClick={handleLogVisit} disabled={visitSaving || !visitForm.visitorName.trim()} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50">
                            {visitSaving ? t('leads', 'saving') : t('leads', 'logVisit')}
                          </button>
                        </div>
                      </div>
                    )}

                    {visits.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('leads', 'noVisits')}</p>
                    ) : (
                      visits.map(visit => (
                        <div key={visit.id} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border dark:border-gray-700">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{visit.visitorName}</p>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(visit.visitedAt)}</span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{visit.purpose}</p>
                          {visit.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{visit.notes}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ── Messages Tab ── */}
              {activeTab === 'messages' && (
                <div className="flex flex-col h-[300px]">
                  <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                    {messages.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">{t('leads', 'noMessages')}</p>
                    ) : (
                      messages.map(msg => (
                        <div key={msg.id} className="flex gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300">{msg.senderName.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5 border dark:border-gray-700 max-w-[80%]">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{msg.senderName}</span>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(msg.sentAt)}</span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="flex gap-2 border-t dark:border-gray-700 pt-3">
                    <textarea
                      value={messageBody}
                      onChange={e => setMessageBody(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      placeholder={t('leads', 'messagePlaceholder')}
                      rows={1}
                      className={`flex-1 ${INPUT_CLS} resize-none`}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={messageSending || !messageBody.trim()}
                      className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
                    >
                      {t('leads', 'send')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );

    // ── Contact edit panel ──
    const renderContactPanel = () => (
      <div className="p-5 space-y-5">
        {/* Editable contact fields */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('leads', 'contactInfo')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'name')}</label>
              <input type="text" value={detailForm.name} onChange={e => setDetailForm({ ...detailForm, name: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'email')}</label>
              <input type="email" value={detailForm.email} onChange={e => setDetailForm({ ...detailForm, email: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'company')}</label>
              <input type="text" value={detailForm.company} onChange={e => setDetailForm({ ...detailForm, company: e.target.value })} className={INPUT_CLS} />
            </div>

            {/* Linked Business */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {fr ? 'Entreprise reliée' : 'Linked Business'}
              </label>
              {selectedLead?.managedClient ? (
                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2 border border-green-200 dark:border-green-800">
                  <svg className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300 truncate">{selectedLead.managedClient.companyName}</p>
                    <p className="text-xs text-green-600 dark:text-green-400 truncate">{selectedLead.managedClient.displayName}</p>
                  </div>
                  <button
                    onClick={handleUnlinkBusiness}
                    disabled={bizLinking}
                    className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  >
                    {fr ? 'Délier' : 'Unlink'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder={fr ? 'Taper pour voir les 4-5 correspondances...' : 'Type to see the top 4-5 matches...'}
                    value={bizSearchQuery}
                    onFocus={() => { void ensureBizClientsLoaded(); }}
                    onChange={e => handleBizSearch(e.target.value)}
                    className={INPUT_CLS}
                  />
                  {bizSearching && bizSearchResults.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{fr ? 'Chargement de la liste...' : 'Loading list...'}</p>
                  )}
                  {bizSearchResults.length > 0 && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      {bizSearchResults.map(biz => (
                        <button
                          key={biz.id}
                          onClick={() => handleLinkBusiness(biz.id)}
                          disabled={bizLinking}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{biz.companyName}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{biz.name}</p>
                          </div>
                          <span className="text-xs text-brand-600 dark:text-brand-400 font-medium flex-shrink-0 ml-2">
                            {fr ? 'Relier' : 'Link'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {bizSearchQuery.length > 0 && !bizSearching && bizSearchResults.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {fr ? 'Aucune entreprise dans la liste — importez-la d\'abord depuis Entreprises.' : 'No businesses in the list — import one first from Businesses.'}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'phone')}</label>
              <input type="tel" value={detailForm.phone} onChange={e => setDetailForm({ ...detailForm, phone: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'phone2')}</label>
              <input type="tel" value={detailForm.phone2} onChange={e => setDetailForm({ ...detailForm, phone2: e.target.value })} className={INPUT_CLS} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'otherContacts')}</label>
              <input type="text" value={detailForm.otherContacts} onChange={e => setDetailForm({ ...detailForm, otherContacts: e.target.value })} className={INPUT_CLS} placeholder={t('leads', 'otherContactsPlaceholder')} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'source')}</label>
              <select value={detailForm.source} onChange={e => setDetailForm({ ...detailForm, source: e.target.value as LeadSource })} className={INPUT_CLS}>
                {SOURCES.map(s => <option key={s} value={s}>{t('leads', `source_${s}`)}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Save contact button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSaveContact}
            disabled={saving}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? t('leads', 'saving') : t('leads', 'save')}
          </button>
        </div>

        <hr className="border-gray-100 dark:border-gray-700" />

        {/* Projects section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('leads', 'projects')}</h3>
            <button onClick={() => setShowNewProject(true)} className="text-sm font-medium text-brand-600 hover:text-brand-700 transition">
              + {t('leads', 'newProject')}
            </button>
          </div>

          {/* New project form */}
          {showNewProject && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
              <input
                className={INPUT_CLS}
                placeholder={t('leads', 'projectNamePlaceholder')}
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
              />
              <div className="flex gap-2">
                <button onClick={handleCreateProject} disabled={projectSaving || !newProjectName.trim()} className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                  {t('leads', 'create')}
                </button>
                <button onClick={() => { setShowNewProject(false); setNewProjectName(''); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  {t('leads', 'cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Project list (simplified — name + status badge, clickable) */}
          {projects.length === 0 && !showNewProject ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('leads', 'noProjects')}</p>
          ) : (
            <div className="space-y-1">
              {projects.map(proj => (
                <button
                  key={proj.id}
                  onClick={() => { setEditMode('project'); setSelectedProjectId(proj.id); }}
                  className="w-full px-3 py-2 flex items-center gap-2 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{proj.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    proj.status === 'won' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    proj.status === 'lost' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                    proj.status === 'on_hold' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {t('leads', `projectStatus_${proj.status}`)}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{proj.quotes.length} {t('leads', proj.quotes.length === 1 ? 'quote' : 'quotes')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <hr className="border-gray-100 dark:border-gray-700" />

        {renderActivityTabs()}
      </div>
    );

    // ── Project edit panel ──
    const renderProjectPanel = () => (
      <div className="p-5 space-y-5">
        {/* Back to contact + open full editor */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => { setEditMode('contact'); setSelectedProjectId(null); }}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium transition"
          >
            &larr; Contact
          </button>
          {selectedProjectId && (
            <Link
              href={`/admin/projects/${selectedProjectId}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
              title={lang === 'fr' ? 'Ouvrir la fiche complète du projet' : 'Open full project editor'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
              </svg>
              {lang === 'fr' ? 'Ouvrir la fiche' : 'Open full editor'}
            </Link>
          )}
        </div>

        {/* Project fields */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('leads', 'projects')}</h3>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'name')}</label>
            <input type="text" value={projectForm.name} onChange={e => setProjectForm({ ...projectForm, name: e.target.value })} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'callbackReason')}</label>
            <input type="text" value={projectForm.callbackReason} onChange={e => setProjectForm({ ...projectForm, callbackReason: e.target.value })} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'suggestedProducts')}</label>
            <input type="text" value={projectForm.suggestedProducts} onChange={e => setProjectForm({ ...projectForm, suggestedProducts: e.target.value })} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'objective')}</label>
            <textarea value={projectForm.objective} onChange={e => setProjectForm({ ...projectForm, objective: e.target.value })} rows={2} className={`${INPUT_CLS} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'budget')}</label>
              <input type="number" value={projectForm.budget} onChange={e => setProjectForm({ ...projectForm, budget: e.target.value })} placeholder="0.00" className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'estimatedValue')}</label>
              <input type="number" value={detailForm.estimatedValue} onChange={e => setDetailForm({ ...detailForm, estimatedValue: e.target.value })} placeholder="0.00" className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'notes')}</label>
            <textarea value={projectForm.notes} onChange={e => setProjectForm({ ...projectForm, notes: e.target.value })} rows={3} className={`${INPUT_CLS} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'nextFollowUp')}</label>
              <input type="date" value={detailForm.nextFollowUpAt} onChange={e => setDetailForm({ ...detailForm, nextFollowUpAt: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'assignedTo')}</label>
              <select value={detailForm.assignedToId} onChange={e => setDetailForm({ ...detailForm, assignedToId: e.target.value })} className={INPUT_CLS}>
                <option value="">{t('leads', 'unassigned')}</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'stage')}</label>
              <select value={detailForm.stage} onChange={e => setDetailForm({ ...detailForm, stage: e.target.value as LeadStage })} className={INPUT_CLS}>
                {STAGES.map(s => <option key={s} value={s}>{t('leads', `stage_${s}`)}</option>)}
              </select>
            </div>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-gray-700" />

        {/* Products of Interest (QB items checkboxes) */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('leads', 'productsOfInterest')}</h3>
          {qbItems.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('leads', 'noQbInventory')}</p>
          ) : (
            <div className="max-h-[160px] overflow-y-auto border dark:border-gray-700 rounded-lg p-2 space-y-1">
              {qbItems.map(item => (
                <label key={item.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={detailForm.productsOfInterest.includes(item.name)}
                    onChange={() => toggleProduct(item.name)}
                    className="rounded border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                  {item.type && <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">{item.type}</span>}
                </label>
              ))}
            </div>
          )}
          {detailForm.productsOfInterest.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {detailForm.productsOfInterest.map(p => (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300">
                  {p}
                  <button onClick={() => toggleProduct(p)} className="text-brand-400 hover:text-brand-600">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <hr className="border-gray-100 dark:border-gray-700" />

        {/* Quotes management */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('leads', 'quotes')}</h3>
            {selectedProjectId && (
              <button onClick={() => { setShowNewQuote(selectedProjectId); setNewQuoteItems([{ description: '', quantity: 1, unitPrice: 0, unit: '' }]); }} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                + {t('leads', 'newQuote')}
              </button>
            )}
          </div>

          {/* New quote form */}
          {showNewQuote === selectedProjectId && selectedProjectId && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('leads', 'quoteItems')}</p>
              {newQuoteItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input className={`${INPUT_CLS} flex-1`} placeholder={t('leads', 'itemDescription')} value={item.description} onChange={e => { const a = [...newQuoteItems]; a[idx] = { ...a[idx], description: e.target.value }; setNewQuoteItems(a); }} />
                  <input className={`${INPUT_CLS} w-16`} type="number" placeholder={t('leads', 'qty')} value={item.quantity} onChange={e => { const a = [...newQuoteItems]; a[idx] = { ...a[idx], quantity: Number(e.target.value) || 1 }; setNewQuoteItems(a); }} />
                  <input className={`${INPUT_CLS} w-24`} type="number" step="0.01" placeholder={t('leads', 'price')} value={item.unitPrice || ''} onChange={e => { const a = [...newQuoteItems]; a[idx] = { ...a[idx], unitPrice: Number(e.target.value) || 0 }; setNewQuoteItems(a); }} />
                  {newQuoteItems.length > 1 && <button onClick={() => setNewQuoteItems(newQuoteItems.filter((_, j) => j !== idx))} className="text-red-400 hover:text-red-600 text-xs">✕</button>}
                </div>
              ))}
              <button onClick={() => setNewQuoteItems([...newQuoteItems, { description: '', quantity: 1, unitPrice: 0, unit: '' }])} className="text-xs text-brand-600 hover:text-brand-700">+ {t('leads', 'addItem')}</button>
              <div className="flex gap-2 pt-1">
                <button onClick={() => handleCreateQuote(selectedProjectId)} disabled={projectSaving} className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">{t('leads', 'create')}</button>
                <button onClick={() => setShowNewQuote(null)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">{t('leads', 'cancel')}</button>
              </div>
            </div>
          )}

          {/* Quote list for this project */}
          {currentProject ? (
            currentProject.quotes.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">{t('leads', 'noQuotes')}</p>
            ) : (
              currentProject.quotes.map(q => (
                <div key={q.id} className="border dark:border-gray-600 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setOpenQuoteId(openQuoteId === q.id ? null : q.id)}
                    className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{openQuoteId === q.id ? '\u25BC' : '\u25B6'}</span>
                      <span className="text-sm text-gray-800 dark:text-gray-200">{q.quoteNumber || t('leads', 'untitledQuote')}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        q.status === 'accepted' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        q.status === 'refused' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {t('leads', `quoteStatus_${q.status}`)}
                      </span>
                      <span className="text-xs text-gray-400">{q.items.length} {t('leads', q.items.length === 1 ? 'item' : 'items')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        ${q.items.reduce((sum: number, it: ProjectQuoteItem) => sum + it.quantity * it.unitPrice, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </button>

                  {openQuoteId === q.id && (
                    <div className="px-3 pb-3 border-t dark:border-gray-600 space-y-2 pt-2">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setDuplicateModal({ quote: q, projectId: currentProject.id }); setDuplicateSelected(new Set(q.items.map((i: ProjectQuoteItem) => i.id))); }}
                          className="text-xs text-brand-600 hover:text-brand-700"
                        >
                          {t('leads', 'duplicateQuote')}
                        </button>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 dark:text-gray-400 border-b dark:border-gray-600">
                            <th className="text-left py-1 font-medium">{t('leads', 'itemDescription')}</th>
                            <th className="text-right py-1 font-medium w-14">{t('leads', 'qty')}</th>
                            <th className="text-right py-1 font-medium w-20">{t('leads', 'price')}</th>
                            <th className="text-right py-1 font-medium w-24">{t('leads', 'total')}</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {q.items.map((item: ProjectQuoteItem) => (
                            <tr key={item.id} className="border-b dark:border-gray-700/50">
                              <td className="py-1.5 text-gray-800 dark:text-gray-200">{item.description}</td>
                              <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{item.quantity}</td>
                              <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">${item.unitPrice.toFixed(2)}</td>
                              <td className="py-1.5 text-right text-gray-700 dark:text-gray-300">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                              <td className="py-1.5 text-right">
                                <button onClick={() => handleDeleteQuoteItem(currentProject.id, q.id, item.id)} className="text-red-400 hover:text-red-600 transition" title={t('leads', 'removeItem')}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-medium">
                            <td colSpan={3} className="py-1.5 text-right text-gray-600 dark:text-gray-400">{t('leads', 'total')}</td>
                            <td className="py-1.5 text-right text-gray-900 dark:text-gray-100">${q.items.reduce((s: number, i: ProjectQuoteItem) => s + i.quantity * i.unitPrice, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">{t('leads', 'noQuotes')}</p>
          )}
        </div>

        <hr className="border-gray-100 dark:border-gray-700" />

        {renderActivityTabs()}

        {/* Refuse project button */}
        {selectedProjectId && currentProject && currentProject.status !== 'lost' && (
          <>
            <hr className="border-gray-100 dark:border-gray-700" />
            <div className="flex justify-start">
              <button
                onClick={() => handleRefuseProject(selectedProjectId)}
                className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              >
                {t('leads', 'refuseProject')}
              </button>
            </div>
          </>
        )}

        {/* Save project button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSaveProject}
            disabled={saving}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? t('leads', 'saving') : t('leads', 'save')}
          </button>
        </div>
      </div>
    );

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => { setSelectedId(null); setEditMode('contact'); setSelectedProjectId(null); }}
        />
        {/* Panel */}
        <div className="fixed top-0 right-0 h-full w-2/3 z-50 bg-white dark:bg-gray-800 shadow-xl border-l dark:border-gray-700 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-5 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3 min-w-0">
              {selectedLead.photo ? (
                <img src={selectedLead.photo} alt={selectedLead.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-brand-700 dark:text-brand-300">{selectedLead.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                  {editMode === 'project' && currentProject ? currentProject.name : selectedLead.name}
                </h2>
                {editMode === 'contact' && selectedLead.company && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedLead.company}</p>}
                {editMode === 'project' && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedLead.name} {selectedLead.company ? `- ${selectedLead.company}` : ''}</p>}
              </div>
            </div>
            <button onClick={() => { setSelectedId(null); setEditMode('contact'); setSelectedProjectId(null); }} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {editMode === 'contact' ? renderContactPanel() : renderProjectPanel()}
        </div>

        {/* Duplicate quote modal */}
        {duplicateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('leads', 'duplicateQuote')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('leads', 'selectItemsToDuplicate')}</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {duplicateModal.quote.items.map((item: ProjectQuoteItem) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={duplicateSelected.has(item.id)}
                      onChange={() => {
                        const next = new Set(duplicateSelected);
                        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                        setDuplicateSelected(next);
                      }}
                      className="rounded"
                    />
                    <span className="text-gray-800 dark:text-gray-200 flex-1">{item.description}</span>
                    <span className="text-gray-500 dark:text-gray-400">${(item.quantity * item.unitPrice).toFixed(2)}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setDuplicateModal(null); setDuplicateSelected(new Set()); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">{t('leads', 'cancel')}</button>
                <button onClick={handleDuplicateQuote} disabled={projectSaving || duplicateSelected.size === 0} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                  {t('leads', 'duplicate')} ({duplicateSelected.size} {t('leads', duplicateSelected.size === 1 ? 'item' : 'items')})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Complete meeting → unified finalize modal (2026-04-20) ──
            The old star-picker modal was replaced in favor of the
            richer EndVisitModal which handles present/not-present,
            promote-to-lead + attach-as-coleads, project picker, and
            the create-new-project fallback. */}
        {completingMeetingId && (
          <EndVisitModal
            entry={{ kind: 'meeting', id: completingMeetingId }}
            onClose={() => { setCompletingMeetingId(null); setSelectedMainContactAttendeeId(null); }}
            onFinished={() => {
              setCompletingMeetingId(null);
              setSelectedMainContactAttendeeId(null);
              if (selectedProjectId) loadMeetings(selectedProjectId);
            }}
          />
        )}
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header area */}
      <div className="p-6 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
        <PageHeader
          title={t('leads', 'title')}
          subtitle={t('leads', 'subtitle')}
          actions={
            <button
              onClick={() => setShowNewLead(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('leads', 'newLead')}
            </button>
          }
        />

        {/* View toggle */}
        <div className="flex items-center gap-2 mb-4">
          {(['list', 'pipeline', 'calendar'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                viewMode === mode ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('leads', `view${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder={t('leads', 'searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${INPUT_CLS} mb-3`}
        />

        {/* Stage filter chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStageFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
              stageFilter === 'all' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {t('leads', 'filterAll')}
          </button>
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                stageFilter === s ? STAGE_COLORS[s] : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('leads', `stage_${s}`)}
            </button>
          ))}
        </div>
        {/* Source filter chips */}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setSourceFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
              sourceFilter === 'all' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {t('leads', 'filterAll')}
          </button>
          {SOURCES.map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                sourceFilter === s ? 'bg-gray-700 text-white dark:bg-gray-300 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('leads', `source_${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : viewMode === 'pipeline' ? (
          renderPipeline()
        ) : viewMode === 'calendar' ? (
          renderCalendar()
        ) : (
          renderTable()
        )}
      </div>

      {/* Detail slide-in panel */}
      {selectedLead && renderDetailPanel()}

      {/* ── New Lead Modal ─────────────────────────────────────────────────── */}
      {showNewLead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('leads', 'newLead')}</h3>
              <button onClick={() => setShowNewLead(false)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'name')}</label>
                <input type="text" value={newLeadForm.name} onChange={e => setNewLeadForm({ ...newLeadForm, name: e.target.value })} className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'email')}</label>
                  <input type="email" value={newLeadForm.email} onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'phone')}</label>
                  <input type="tel" value={newLeadForm.phone} onChange={e => setNewLeadForm({ ...newLeadForm, phone: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'phone2')}</label>
                  <input type="tel" value={newLeadForm.phone2} onChange={e => setNewLeadForm({ ...newLeadForm, phone2: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'company')}</label>
                  <input type="text" value={newLeadForm.company} onChange={e => setNewLeadForm({ ...newLeadForm, company: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'callbackReason')}</label>
                <input type="text" value={newLeadForm.callbackReason} onChange={e => setNewLeadForm({ ...newLeadForm, callbackReason: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'objective')}</label>
                <textarea value={newLeadForm.objective} onChange={e => setNewLeadForm({ ...newLeadForm, objective: e.target.value })} rows={2} className={`${INPUT_CLS} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'budget')}</label>
                  <input type="number" value={newLeadForm.budget} onChange={e => setNewLeadForm({ ...newLeadForm, budget: e.target.value })} placeholder="0.00" className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'source')}</label>
                  <select value={newLeadForm.source} onChange={e => setNewLeadForm({ ...newLeadForm, source: e.target.value as LeadSource })} className={INPUT_CLS}>
                    {SOURCES.map(s => <option key={s} value={s}>{t('leads', `source_${s}`)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('leads', 'notes')}</label>
                <textarea value={newLeadForm.notes} onChange={e => setNewLeadForm({ ...newLeadForm, notes: e.target.value })} rows={3} className={`${INPUT_CLS} resize-none`} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setShowNewLead(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition"
              >
                {t('leads', 'cancel')}
              </button>
              <button
                onClick={handleCreateLead}
                disabled={newLeadSaving || !newLeadForm.name.trim()}
                className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
              >
                {newLeadSaving ? t('leads', 'saving') : t('leads', 'create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
