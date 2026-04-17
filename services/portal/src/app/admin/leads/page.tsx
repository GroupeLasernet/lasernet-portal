'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

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
  new: 'bg-blue-100 text-blue-800',
  qualified: 'bg-indigo-100 text-indigo-800',
  demo_scheduled: 'bg-yellow-100 text-yellow-800',
  demo_done: 'bg-orange-100 text-orange-800',
  quote_sent: 'bg-purple-100 text-purple-800',
  negotiation: 'bg-pink-100 text-pink-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800',
};

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent';

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
  const { t } = useLanguage();

  // ── Data state ──
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [qbItems, setQbItems] = useState<QBItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── List filters ──
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LeadStage | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'pipeline' | 'calendar'>('list');

  // ── Detail panel form state ──
  const [detailForm, setDetailForm] = useState({
    name: '', email: '', phone: '', phone2: '', company: '',
    otherContacts: '', callbackReason: '', objective: '',
    budget: '', source: 'inbound_call' as LeadSource, stage: 'new' as LeadStage,
    assignedToId: '', estimatedValue: '', nextFollowUpAt: '', notes: '',
    productsOfInterest: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // ── Detail tabs ──
  const [activeTab, setActiveTab] = useState<'activity' | 'calls' | 'visits' | 'messages'>('activity');
  const [calls, setCalls] = useState<LeadCall[]>([]);
  const [visits, setVisits] = useState<LeadVisit[]>([]);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // ── Log call form ──
  const [showCallForm, setShowCallForm] = useState(false);
  const [callForm, setCallForm] = useState({ type: 'outbound' as 'inbound' | 'outbound', clientType: 'new' as 'existing' | 'new', outcome: '', duration: '', notes: '' });
  const [callSaving, setCallSaving] = useState(false);

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

  // ── Fetch QB inventory ──
  const fetchQBInventory = async () => {
    try {
      const res = await fetch('/api/quickbooks/inventory');
      const data = await res.json();
      if (data.items) setQbItems(data.items);
    } catch { /* silently fail */ }
  };

  useEffect(() => {
    fetchLeads();
    fetchTeam();
    fetchQBInventory();
  }, []);

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
      setActiveTab('activity');
      loadTabData('activity', selectedLead.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Load tab data ──
  const loadTabData = async (tab: string, leadId: string) => {
    setTabLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/${tab}`);
      const data = await res.json();
      if (tab === 'calls') setCalls(data.calls ?? []);
      if (tab === 'visits') setVisits(data.visits ?? []);
      if (tab === 'messages') setMessages(data.messages ?? []);
      if (tab === 'activity') setActivities(data.activities ?? []);
    } catch { /* silently fail */ }
    setTabLoading(false);
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

  // ── Save lead detail ──
  const handleSave = async () => {
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
          callbackReason: detailForm.callbackReason || null,
          objective: detailForm.objective || null,
          budget: detailForm.budget ? parseFloat(detailForm.budget) : null,
          source: detailForm.source,
          stage: detailForm.stage,
          assignedToId: detailForm.assignedToId || null,
          estimatedValue: detailForm.estimatedValue ? parseFloat(detailForm.estimatedValue) : null,
          nextFollowUpAt: detailForm.nextFollowUpAt || null,
          notes: detailForm.notes || null,
          productsOfInterest: detailForm.productsOfInterest.length > 0
            ? JSON.stringify(detailForm.productsOfInterest) : null,
        }),
      });
      await fetchLeads();
    } catch { /* silently fail */ }
    setSaving(false);
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
      return <div className="text-center text-gray-400 py-16 text-sm">{t('leads', 'noLeads')}</div>;
    }
    return (
      <div className="overflow-x-auto border rounded-xl bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Client Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Reason of Call</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Inventory Type Suggested</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Business Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Objective</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">Avg Budget</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map(lead => {
              const products = parseProducts(lead.productsOfInterest);
              return (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`cursor-pointer hover:bg-gray-50 transition ${selectedId === lead.id ? 'bg-brand-50' : ''}`}
                >
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span>{lead.name}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STAGE_COLORS[lead.stage]}`}>
                        {t('leads', `stage_${lead.stage}`)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{lead.callbackReason || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{products.length > 0 ? products.join(', ') : '-'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{lead.phone || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{lead.company || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{lead.email || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{lead.objective || '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {lead.budget != null ? `$${lead.budget.toLocaleString()}` : '-'}
                  </td>
                </tr>
              );
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
          <div key={stage} className="flex-shrink-0 w-64 bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[stage]}`}>
                {t('leads', `stage_${stage}`)}
              </span>
              <span className="text-xs text-gray-400">{stageLeads.length}</span>
            </div>
            <div className="space-y-2">
              {stageLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`w-full text-left bg-white rounded-lg shadow-sm border p-3 hover:shadow-md transition ${
                    selectedId === lead.id ? 'ring-2 ring-brand-600' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                  {lead.company && <p className="text-xs text-gray-500 truncate">{lead.company}</p>}
                  {lead.estimatedValue != null && (
                    <p className="text-xs font-medium text-brand-600 mt-1">${lead.estimatedValue.toLocaleString()}</p>
                  )}
                </button>
              ))}
              {stageLeads.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">{t('leads', 'noLeads')}</p>
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
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700">Follow-up Calendar</h3>
          <p className="text-xs text-gray-400 mt-1">Next 60 days - showing leads with scheduled follow-ups</p>
        </div>
        <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
          <div className="grid grid-cols-7 gap-px bg-gray-200">
            {/* Day-of-week headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="bg-gray-50 px-2 py-2 text-xs font-semibold text-gray-500 text-center">{d}</div>
            ))}
            {/* Leading empty cells to align first day */}
            {Array.from({ length: calendarDays[0]?.getDay() ?? 0 }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-white min-h-[80px]" />
            ))}
            {calendarDays.map(day => {
              const key = dateKey(day);
              const dayLeads = calendarMap[key] || [];
              const isToday = key === todayStr;
              return (
                <div
                  key={key}
                  className={`bg-white min-h-[80px] p-1.5 ${isToday ? 'ring-2 ring-inset ring-brand-500' : ''}`}
                >
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'text-brand-600' : 'text-gray-500'}`}>
                    {day.getDate()}
                    {day.getDate() === 1 && (
                      <span className="ml-1 text-[10px] text-gray-400">
                        {day.toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayLeads.map(lead => (
                      <button
                        key={lead.id}
                        onClick={() => setSelectedId(lead.id)}
                        className="block w-full text-left px-1 py-0.5 rounded text-[10px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 truncate transition"
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

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setSelectedId(null)}
        />
        {/* Panel */}
        <div className="fixed top-0 right-0 h-full w-full max-w-[500px] z-50 bg-white shadow-xl border-l overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3 min-w-0">
              {selectedLead.photo ? (
                <img src={selectedLead.photo} alt={selectedLead.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-brand-700">{selectedLead.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900 truncate">{selectedLead.name}</h2>
                {selectedLead.company && <p className="text-xs text-gray-500 truncate">{selectedLead.company}</p>}
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} className="p-1.5 text-gray-400 hover:text-gray-600 transition rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Editable fields */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Info</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'name')}</label>
                  <input type="text" value={detailForm.name} onChange={e => setDetailForm({ ...detailForm, name: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'email')}</label>
                  <input type="email" value={detailForm.email} onChange={e => setDetailForm({ ...detailForm, email: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'company')}</label>
                  <input type="text" value={detailForm.company} onChange={e => setDetailForm({ ...detailForm, company: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'phone')}</label>
                  <input type="tel" value={detailForm.phone} onChange={e => setDetailForm({ ...detailForm, phone: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone 2</label>
                  <input type="tel" value={detailForm.phone2} onChange={e => setDetailForm({ ...detailForm, phone2: e.target.value })} className={INPUT_CLS} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Other Contacts</label>
                  <input type="text" value={detailForm.otherContacts} onChange={e => setDetailForm({ ...detailForm, otherContacts: e.target.value })} className={INPUT_CLS} placeholder="Alternate emails, contacts..." />
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Lead details */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lead Details</h3>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Callback Reason</label>
                <input type="text" value={detailForm.callbackReason} onChange={e => setDetailForm({ ...detailForm, callbackReason: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Objective</label>
                <textarea value={detailForm.objective} onChange={e => setDetailForm({ ...detailForm, objective: e.target.value })} rows={2} className={`${INPUT_CLS} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Budget</label>
                  <input type="number" value={detailForm.budget} onChange={e => setDetailForm({ ...detailForm, budget: e.target.value })} placeholder="0.00" className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'estimatedValue')}</label>
                  <input type="number" value={detailForm.estimatedValue} onChange={e => setDetailForm({ ...detailForm, estimatedValue: e.target.value })} placeholder="0.00" className={INPUT_CLS} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'stage')}</label>
                  <select value={detailForm.stage} onChange={e => setDetailForm({ ...detailForm, stage: e.target.value as LeadStage })} className={INPUT_CLS}>
                    {STAGES.map(s => <option key={s} value={s}>{t('leads', `stage_${s}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'source')}</label>
                  <select value={detailForm.source} onChange={e => setDetailForm({ ...detailForm, source: e.target.value as LeadSource })} className={INPUT_CLS}>
                    {SOURCES.map(s => <option key={s} value={s}>{t('leads', `source_${s}`)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'assignedTo')}</label>
                  <select value={detailForm.assignedToId} onChange={e => setDetailForm({ ...detailForm, assignedToId: e.target.value })} className={INPUT_CLS}>
                    <option value="">{t('leads', 'unassigned')}</option>
                    {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'nextFollowUp')}</label>
                  <input type="date" value={detailForm.nextFollowUpAt} onChange={e => setDetailForm({ ...detailForm, nextFollowUpAt: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'notes')}</label>
                <textarea value={detailForm.notes} onChange={e => setDetailForm({ ...detailForm, notes: e.target.value })} rows={3} className={`${INPUT_CLS} resize-none`} />
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Products of Interest */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Products of Interest</h3>
              {qbItems.length === 0 ? (
                <p className="text-xs text-gray-400">No inventory items loaded from QuickBooks.</p>
              ) : (
                <div className="max-h-[160px] overflow-y-auto border rounded-lg p-2 space-y-1">
                  {qbItems.map(item => (
                    <label key={item.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={detailForm.productsOfInterest.includes(item.name)}
                        onChange={() => toggleProduct(item.name)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm text-gray-700">{item.name}</span>
                      {item.type && <span className="text-[10px] text-gray-400 ml-auto">{item.type}</span>}
                    </label>
                  ))}
                </div>
              )}
              {/* Show selected as tags */}
              {detailForm.productsOfInterest.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detailForm.productsOfInterest.map(p => (
                    <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">
                      {p}
                      <button onClick={() => toggleProduct(p)} className="text-brand-400 hover:text-brand-600">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <hr className="border-gray-100" />

            {/* Quotes placeholder */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Quotes</h3>
              <div className="border border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center text-gray-400">
                <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium">Quotes tracking coming soon</p>
              </div>
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
              >
                {saving ? t('leads', 'saving') : t('leads', 'save')}
              </button>
            </div>

            <hr className="border-gray-100" />

            {/* Tabbed section: Activity, Calls, Visits, Messages */}
            <div className="bg-white rounded-xl border">
              <div className="flex border-b">
                {(['activity', 'calls', 'visits', 'messages'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-3 text-sm font-medium text-center transition border-b-2 ${
                      activeTab === tab
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
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
                          <p className="text-sm text-gray-400 text-center py-8">{t('leads', 'noActivity')}</p>
                        ) : (
                          <div className="relative pl-4 border-l-2 border-gray-200 space-y-4">
                            {activities.map(act => (
                              <div key={act.id} className="relative">
                                <div className={`absolute -left-[21px] w-3 h-3 rounded-full border-2 border-white ${
                                  act.type === 'stage_change' ? 'bg-brand-600' :
                                  act.type === 'call_logged' ? 'bg-blue-500' :
                                  act.type === 'visit_logged' ? 'bg-orange-500' :
                                  act.type === 'message_sent' ? 'bg-green-500' :
                                  act.type === 'assignment_change' ? 'bg-purple-500' :
                                  'bg-gray-400'
                                }`} />
                                <div className="ml-2">
                                  <p className="text-sm text-gray-700">{act.description}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-gray-400">{formatDate(act.createdAt)}</span>
                                    {(act.actorName || act.actor?.name) && (
                                      <span className="text-[10px] text-gray-400">{act.actorName || act.actor?.name}</span>
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
                          <div className="bg-gray-50 rounded-lg p-4 space-y-3 border">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'callType')}</label>
                                <select value={callForm.type} onChange={e => setCallForm({ ...callForm, type: e.target.value as 'inbound' | 'outbound' })} className={INPUT_CLS}>
                                  <option value="outbound">{t('leads', 'callOutbound')}</option>
                                  <option value="inbound">{t('leads', 'callInbound')}</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'clientType')}</label>
                                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => setCallForm({ ...callForm, clientType: 'new' })}
                                    className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                                      callForm.clientType === 'new' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    {t('leads', 'clientNew')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCallForm({ ...callForm, clientType: 'existing' })}
                                    className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                                      callForm.clientType === 'existing' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    {t('leads', 'clientExisting')}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'callDuration')}</label>
                              <input type="number" placeholder={t('leads', 'durationSeconds')} value={callForm.duration} onChange={e => setCallForm({ ...callForm, duration: e.target.value })} className={INPUT_CLS} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'callOutcome')}</label>
                              <input type="text" value={callForm.outcome} onChange={e => setCallForm({ ...callForm, outcome: e.target.value })} className={INPUT_CLS} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'notes')}</label>
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
                          <p className="text-sm text-gray-400 text-center py-8">{t('leads', 'noCalls')}</p>
                        ) : (
                          calls.map(call => (
                            <div key={call.id} className="bg-gray-50 rounded-lg p-3 border">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                    call.type === 'inbound' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {t('leads', `call${call.type.charAt(0).toUpperCase() + call.type.slice(1)}`)}
                                  </span>
                                  {(call as any).clientType && (
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                      (call as any).clientType === 'existing' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {(call as any).clientType === 'existing' ? t('leads', 'clientExisting') : t('leads', 'clientNew')}
                                    </span>
                                  )}
                                  {call.outcome && <span className="text-xs text-gray-600">{call.outcome}</span>}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                  {call.duration != null && <span>{formatDuration(call.duration)}</span>}
                                  <span>{formatDate(call.calledAt)}</span>
                                </div>
                              </div>
                              {call.notes && <p className="text-xs text-gray-600 mt-1">{call.notes}</p>}
                              <p className="text-[10px] text-gray-400 mt-1">{call.loggedBy?.name || ''}</p>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* ── Visits Tab ── */}
                    {activeTab === 'visits' && (
                      <div className="space-y-3">
                        {visits.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-8">{t('leads', 'noVisits')}</p>
                        ) : (
                          visits.map(visit => (
                            <div key={visit.id} className="bg-gray-50 rounded-lg p-3 border">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium text-gray-900">{visit.visitorName}</p>
                                <span className="text-[10px] text-gray-400">{formatDate(visit.visitedAt)}</span>
                              </div>
                              <p className="text-xs text-gray-600">{visit.purpose}</p>
                              {visit.notes && <p className="text-xs text-gray-500 mt-1">{visit.notes}</p>}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* ── Messages Tab ── */}
                    {activeTab === 'messages' && (
                      <div className="flex flex-col h-[300px]">
                        <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                          {messages.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-8">{t('leads', 'noMessages')}</p>
                          ) : (
                            messages.map(msg => (
                              <div key={msg.id} className="flex gap-2">
                                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[10px] font-bold text-brand-700">{msg.senderName.charAt(0).toUpperCase()}</span>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-2.5 border max-w-[80%]">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-medium text-gray-900">{msg.senderName}</span>
                                    <span className="text-[10px] text-gray-400">{formatDate(msg.sentAt)}</span>
                                  </div>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.content}</p>
                                </div>
                              </div>
                            ))
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                        <div className="flex gap-2 border-t pt-3">
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
          </div>
        </div>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header area */}
      <div className="p-6 border-b bg-white">
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
                viewMode === mode ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
              stageFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('leads', 'filterAll')}
          </button>
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                stageFilter === s ? STAGE_COLORS[s] : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
              sourceFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('leads', 'filterAll')}
          </button>
          {SOURCES.map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                sourceFilter === s ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('leads', `source_${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{t('leads', 'newLead')}</h3>
              <button onClick={() => setShowNewLead(false)} className="p-1 text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'name')}</label>
                <input type="text" value={newLeadForm.name} onChange={e => setNewLeadForm({ ...newLeadForm, name: e.target.value })} className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'email')}</label>
                  <input type="email" value={newLeadForm.email} onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'phone')}</label>
                  <input type="tel" value={newLeadForm.phone} onChange={e => setNewLeadForm({ ...newLeadForm, phone: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone 2</label>
                  <input type="tel" value={newLeadForm.phone2} onChange={e => setNewLeadForm({ ...newLeadForm, phone2: e.target.value })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'company')}</label>
                  <input type="text" value={newLeadForm.company} onChange={e => setNewLeadForm({ ...newLeadForm, company: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Callback Reason</label>
                <input type="text" value={newLeadForm.callbackReason} onChange={e => setNewLeadForm({ ...newLeadForm, callbackReason: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Objective</label>
                <textarea value={newLeadForm.objective} onChange={e => setNewLeadForm({ ...newLeadForm, objective: e.target.value })} rows={2} className={`${INPUT_CLS} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Budget</label>
                  <input type="number" value={newLeadForm.budget} onChange={e => setNewLeadForm({ ...newLeadForm, budget: e.target.value })} placeholder="0.00" className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'source')}</label>
                  <select value={newLeadForm.source} onChange={e => setNewLeadForm({ ...newLeadForm, source: e.target.value as LeadSource })} className={INPUT_CLS}>
                    {SOURCES.map(s => <option key={s} value={s}>{t('leads', `source_${s}`)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'notes')}</label>
                <textarea value={newLeadForm.notes} onChange={e => setNewLeadForm({ ...newLeadForm, notes: e.target.value })} rows={3} className={`${INPUT_CLS} resize-none`} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setShowNewLead(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition"
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
