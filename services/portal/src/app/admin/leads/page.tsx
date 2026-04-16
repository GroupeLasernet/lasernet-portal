'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

// ── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
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
  type: string; // stage_change, call_logged, visit_logged, message_sent, assignment_change, note
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

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminLeadsPage() {
  const { t } = useLanguage();

  // ── Data state ──
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── List filters ──
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LeadStage | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'pipeline' | 'calendar'>('list');

  // ── Detail panel state ──
  const [detailStage, setDetailStage] = useState<LeadStage>('new');
  const [detailAssigned, setDetailAssigned] = useState<string>('');
  const [detailValue, setDetailValue] = useState<string>('');
  const [detailFollowUp, setDetailFollowUp] = useState<string>('');
  const [detailNotes, setDetailNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // ── Detail tabs ──
  const [activeTab, setActiveTab] = useState<'calls' | 'visits' | 'messages' | 'activity'>('activity');
  const [calls, setCalls] = useState<LeadCall[]>([]);
  const [visits, setVisits] = useState<LeadVisit[]>([]);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // ── Log call inline form ──
  const [showCallForm, setShowCallForm] = useState(false);
  const [callForm, setCallForm] = useState({ type: 'outbound' as 'inbound' | 'outbound', clientType: 'new' as 'existing' | 'new', outcome: '', duration: '', notes: '' });
  const [callSaving, setCallSaving] = useState(false);

  // ── Send message ──
  const [messageBody, setMessageBody] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  // ── New lead modal ──
  const [showNewLead, setShowNewLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ name: '', email: '', phone: '', company: '', source: 'inbound_call' as LeadSource, notes: '' });
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
      // fallback: try /api/users
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        if (data.users) setTeam(data.users);
        else if (Array.isArray(data)) setTeam(data);
      } catch { /* silently fail */ }
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchTeam();
  }, []);

  // ── When selected lead changes, populate detail fields ──
  useEffect(() => {
    if (selectedLead) {
      setDetailStage(selectedLead.stage);
      setDetailAssigned(selectedLead.assignedTo?.id ?? '');
      setDetailValue(selectedLead.estimatedValue != null ? String(selectedLead.estimatedValue) : '');
      setDetailFollowUp(selectedLead.nextFollowUpAt ? selectedLead.nextFollowUpAt.slice(0, 10) : '');
      setDetailNotes(selectedLead.notes ?? '');
      setActiveTab('activity');
      loadTabData('activity', selectedLead.id);
    }
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
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'messages' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Filtered leads ──
  const filtered = leads.filter(l => {
    if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
    if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.name.toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ── Save lead detail ──
  const handleSave = async () => {
    if (!selectedLead) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: detailStage,
          assignedToId: detailAssigned || null,
          estimatedValue: detailValue ? parseFloat(detailValue) : null,
          nextFollowUpAt: detailFollowUp || null,
          notes: detailNotes,
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
        body: JSON.stringify(newLeadForm),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewLead(false);
        setNewLeadForm({ name: '', email: '', phone: '', company: '', source: 'inbound_call', notes: '' });
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

  // ── Format helpers ──
  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Pipeline view (Kanban) ──
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

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── LEFT PANEL ────────────────────────────────────────────────────── */}
      <div className={`flex flex-col border-r bg-white ${selectedLead ? 'w-1/2 xl:w-2/5' : 'w-full'} transition-all duration-200`}>
        <div className="p-6 border-b">
          <PageHeader
            title={t('leads', 'title')}
            subtitle={t('leads', 'subtitle')}
            actions={
              <button
                onClick={() => setShowNewLead(true)}
                className="btn-primary flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition"
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
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                viewMode === 'list' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('leads', 'viewList')}
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                viewMode === 'pipeline' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('leads', 'viewPipeline')}
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                viewMode === 'calendar' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('leads', 'viewCalendar')}
            </button>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder={t('leads', 'searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
          />

          {/* Filter chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Stage filters */}
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
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Source filters */}
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

        {/* Lead list / Pipeline */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
            </div>
          ) : viewMode === 'pipeline' ? (
            <div className="p-4">{renderPipeline()}</div>
          ) : viewMode === 'calendar' ? (
            <div className="p-4">
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="p-4 border-b">
                  <h3 className="text-sm font-semibold text-gray-700">{t('leads', 'calendarTitle')}</h3>
                  <p className="text-xs text-gray-400 mt-1">{t('leads', 'calendarSubtitle')}</p>
                </div>
                <iframe
                  src="https://calendar.google.com/calendar/embed?showTitle=0&showNav=1&showPrint=0&showTabs=1&showCalendars=0&showTz=0&mode=WEEK"
                  style={{ border: 0, width: '100%', height: 'calc(100vh - 300px)', minHeight: 500 }}
                  frameBorder="0"
                  scrolling="no"
                />
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">{t('leads', 'noLeads')}</div>
          ) : (
            <div className="divide-y">
              {filtered.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`w-full text-left px-6 py-4 hover:bg-gray-50 transition ${
                    selectedId === lead.id ? 'bg-brand-50 border-l-4 border-brand-600' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${STAGE_COLORS[lead.stage]}`}>
                          {t('leads', `stage_${lead.stage}`)}
                        </span>
                      </div>
                      {lead.company && <p className="text-xs text-gray-500 mt-0.5 truncate">{lead.company}</p>}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                          {t('leads', `source_${lead.source}`)}
                        </span>
                        {lead.assignedTo?.name && (
                          <span className="text-[10px] text-gray-400">{lead.assignedTo?.name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] text-gray-400">{formatDate(lead.createdAt)}</span>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        {lead._count.calls > 0 && (
                          <span className="flex items-center gap-0.5" title={t('leads', 'calls')}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                            {lead._count.calls}
                          </span>
                        )}
                        {lead._count.visits > 0 && (
                          <span className="flex items-center gap-0.5" title={t('leads', 'visits')}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {lead._count.visits}
                          </span>
                        )}
                        {lead._count.messages > 0 && (
                          <span className="flex items-center gap-0.5" title={t('leads', 'messages')}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                            {lead._count.messages}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────── */}
      {selectedLead ? (
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6 space-y-6">

            {/* Lead header */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-start gap-4">
                {selectedLead.photo ? (
                  <img src={selectedLead.photo} alt={selectedLead.name} className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-brand-700">
                      {selectedLead.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-gray-900">{selectedLead.name}</h2>
                  {selectedLead.company && <p className="text-sm text-gray-500">{selectedLead.company}</p>}
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    {selectedLead.email && (
                      <a href={`mailto:${selectedLead.email}`} className="hover:text-brand-600 transition truncate">{selectedLead.email}</a>
                    )}
                    {selectedLead.phone && (
                      <a href={`tel:${selectedLead.phone}`} className="hover:text-brand-600 transition">{selectedLead.phone}</a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Editable fields */}
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Stage */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'stage')}</label>
                  <select
                    value={detailStage}
                    onChange={e => setDetailStage(e.target.value as LeadStage)}
                    className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  >
                    {STAGES.map(s => (
                      <option key={s} value={s}>{t('leads', `stage_${s}`)}</option>
                    ))}
                  </select>
                </div>

                {/* Assigned to */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'assignedTo')}</label>
                  <select
                    value={detailAssigned}
                    onChange={e => setDetailAssigned(e.target.value)}
                    className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  >
                    <option value="">{t('leads', 'unassigned')}</option>
                    {team.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Estimated value */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'estimatedValue')}</label>
                  <input
                    type="number"
                    value={detailValue}
                    onChange={e => setDetailValue(e.target.value)}
                    placeholder="0.00"
                    className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>

                {/* Next follow-up */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'nextFollowUp')}</label>
                  <input
                    type="date"
                    value={detailFollowUp}
                    onChange={e => setDetailFollowUp(e.target.value)}
                    className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'notes')}</label>
                <textarea
                  value={detailNotes}
                  onChange={e => setDetailNotes(e.target.value)}
                  rows={3}
                  className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
                >
                  {saving ? t('leads', 'saving') : t('leads', 'save')}
                </button>
              </div>
            </div>

            {/* Tabbed section */}
            <div className="bg-white rounded-xl shadow-sm border">
              {/* Tab bar */}
              <div className="flex border-b">
                {(['calls', 'visits', 'messages', 'activity'] as const).map(tab => (
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

              <div className="p-4 min-h-[300px]">
                {tabLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
                  </div>
                ) : (
                  <>
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
                                <select
                                  value={callForm.type}
                                  onChange={e => setCallForm({ ...callForm, type: e.target.value as 'inbound' | 'outbound' })}
                                  className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                                >
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
                              <input
                                type="number"
                                placeholder={t('leads', 'durationSeconds')}
                                value={callForm.duration}
                                onChange={e => setCallForm({ ...callForm, duration: e.target.value })}
                                className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'callOutcome')}</label>
                              <input
                                type="text"
                                value={callForm.outcome}
                                onChange={e => setCallForm({ ...callForm, outcome: e.target.value })}
                                className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'notes')}</label>
                              <textarea
                                value={callForm.notes}
                                onChange={e => setCallForm({ ...callForm, notes: e.target.value })}
                                rows={2}
                                className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
                              />
                            </div>
                            <div className="flex justify-end">
                              <button
                                onClick={handleLogCall}
                                disabled={callSaving}
                                className="btn-primary px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
                              >
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
                                  <span className="text-[10px] font-bold text-brand-700">
                                    {msg.senderName.charAt(0).toUpperCase()}
                                  </span>
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
                            className="input-field flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
                          />
                          <button
                            onClick={handleSendMessage}
                            disabled={messageSending || !messageBody.trim()}
                            className="btn-primary px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
                          >
                            {t('leads', 'send')}
                          </button>
                        </div>
                      </div>
                    )}

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
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* No lead selected */
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <p className="text-gray-400 text-sm">{t('leads', 'selectLead')}</p>
        </div>
      )}

      {/* ── New Lead Modal ─────────────────────────────────────────────────── */}
      {showNewLead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
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
                <input
                  type="text"
                  value={newLeadForm.name}
                  onChange={e => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                  className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'email')}</label>
                  <input
                    type="email"
                    value={newLeadForm.email}
                    onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'phone')}</label>
                  <input
                    type="tel"
                    value={newLeadForm.phone}
                    onChange={e => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'company')}</label>
                <input
                  type="text"
                  value={newLeadForm.company}
                  onChange={e => setNewLeadForm({ ...newLeadForm, company: e.target.value })}
                  className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'source')}</label>
                <select
                  value={newLeadForm.source}
                  onChange={e => setNewLeadForm({ ...newLeadForm, source: e.target.value as LeadSource })}
                  className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                >
                  {SOURCES.map(s => (
                    <option key={s} value={s}>{t('leads', `source_${s}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('leads', 'notes')}</label>
                <textarea
                  value={newLeadForm.notes}
                  onChange={e => setNewLeadForm({ ...newLeadForm, notes: e.target.value })}
                  rows={3}
                  className="input-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
                />
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
                className="btn-primary px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
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
