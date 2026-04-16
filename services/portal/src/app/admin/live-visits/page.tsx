'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface Visitor {
  id: string;
  leadId: string;
  name: string;
  email: string | null;
  company: string | null;
  photo: string | null;
  isMainContact: boolean;
}

interface VisitGroup {
  id: string;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: string;
  displayName: string | null;
  managedClient: { id: string; companyName: string; displayName: string } | null;
  localBusiness: { id: string; name: string } | null;
  visitors: Visitor[];
  visitCount?: number;
  expectedFollowUpAt: string | null;
  notes: string | null;
}

interface BusinessSearchResult {
  id: string;
  name: string;
  type: 'qb' | 'local' | 'lead';
  managedClientId?: string;
  localBusinessId?: string;
}

// ── Agenda helpers ──────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

const MONTH_NAMES_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Component ────────────────────────────────────────────────────────────────

export default function VisitsPage() {
  const { t, lang } = useLanguage();

  const [visitGroups, setVisitGroups] = useState<VisitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Agenda: offset from current month (0 = current month in slot 2 of 4)
  const [agendaOffset, setAgendaOffset] = useState(0);

  // Drag-and-drop
  const draggedVisitIdRef = useRef<string | null>(null);
  const draggedSourceGroupRef = useRef<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  // Business linking per group
  const [linkingGroupId, setLinkingGroupId] = useState<string | null>(null);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessResults, setBusinessResults] = useState<BusinessSearchResult[]>([]);
  const [searchingBusiness, setSearchingBusiness] = useState(false);
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [newBizForm, setNewBizForm] = useState({
    name: '', address: '', city: '', province: '', phone: '', email: '',
  });

  // Inline name editing per group
  const [editingNameGroupId, setEditingNameGroupId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  // Expandable containers (click or 0.5 s hover)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fullscreen mode for the live visits dark container
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Mobile move dropdown
  const [mobileMovingVisitId, setMobileMovingVisitId] = useState<string | null>(null);

  // Sidebar: collapsible sections & QB inventory
  const [openSidebarSection, setOpenSidebarSection] = useState<string | null>(null);
  const [qbInventory, setQbInventory] = useState<{ id: string; name: string; type: string; description: string | null; qtyOnHand: number | null }[]>([]);
  const [qbConnected, setQbConnected] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  // Needs per group (loaded when expanded)
  const [groupNeeds, setGroupNeeds] = useState<Record<string, { id: string; type: string; description: string | null; status: string }[]>>({});
  // Need note editing
  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [needNoteValue, setNeedNoteValue] = useState('');
  // Dragged sidebar item
  const draggedSidebarItemRef = useRef<{ name: string; type: string } | null>(null);

  // ── Fetch visit groups ──
  const fetchVisitGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/visit-groups');
      const data = await res.json();
      const raw = data.visitGroups || (Array.isArray(data) ? data : []);
      const transformed: VisitGroup[] = raw.map((vg: any) => ({
        id: vg.id,
        status: vg.status,
        startedAt: vg.createdAt,
        displayName: vg.displayName || null,
        managedClient: vg.managedClient || null,
        localBusiness: vg.localBusiness || null,
        visitCount: vg.visits?.length ?? vg._count?.visits ?? 0,
        expectedFollowUpAt: vg.expectedFollowUpAt || null,
        notes: vg.notes || null,
        visitors: (vg.visits || []).map((v: any) => ({
          id: v.id,
          leadId: v.leadId || v.lead?.id || '',
          name: v.visitorName || v.lead?.name || '?',
          email: v.visitorEmail || v.lead?.email || null,
          company: v.visitorCompany || v.lead?.company || null,
          photo: v.visitorPhoto || v.lead?.photo || null,
          isMainContact: !!(vg.mainContactId && (v.leadId === vg.mainContactId || v.lead?.id === vg.mainContactId)),
        })),
      }));
      setVisitGroups(transformed);
    } catch { /* silently fail */ }
    setLoading(false);
  }, []);

  // ── Clock tick ──
  useEffect(() => {
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // ── Auto-refresh (every 10s) ──
  useEffect(() => {
    fetchVisitGroups();
    const dataInterval = setInterval(fetchVisitGroups, 10000);
    return () => clearInterval(dataInterval);
  }, [fetchVisitGroups]);

  // ── Fetch QB inventory on mount ──
  useEffect(() => {
    (async () => {
      setLoadingInventory(true);
      try {
        const res = await fetch('/api/quickbooks/inventory');
        const data = await res.json();
        setQbConnected(data.connected ?? false);
        setQbInventory(data.items || []);
      } catch { /* silently fail */ }
      setLoadingInventory(false);
    })();
  }, []);

  // ── Fetch needs when a group is expanded ──
  const fetchGroupNeeds = useCallback(async (groupId: string) => {
    try {
      const res = await fetch(`/api/visit-groups/${groupId}/needs`);
      const data = await res.json();
      setGroupNeeds(prev => ({ ...prev, [groupId]: data.needs || [] }));
    } catch { /* silently fail */ }
  }, []);

  // Fetch needs for all active groups (so they show under visitor names)
  useEffect(() => {
    for (const vg of visitGroups) {
      if (vg.status === 'active') fetchGroupNeeds(vg.id);
    }
  }, [visitGroups, fetchGroupNeeds]);

  // ── End visit → moves to follow-up ──
  const handleEndVisit = useCallback(async (groupId: string) => {
    try {
      const followUp = new Date();
      followUp.setDate(followUp.getDate() + 7); // default: follow up in 7 days
      await fetch(`/api/visit-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', expectedFollowUpAt: followUp.toISOString() }),
      });
      setExpandedGroupId(null);
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  }, [fetchVisitGroups]);

  // ── Sidebar item drop onto a container → creates a VisitNeed ──
  const handleSidebarDrop = useCallback(async (groupId: string, itemName: string, itemType: string) => {
    try {
      await fetch(`/api/visit-groups/${groupId}/needs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: itemType, description: itemName }),
      });
      await fetchGroupNeeds(groupId);
    } catch { /* silently fail */ }
  }, [fetchGroupNeeds]);

  // ── Delete a need ──
  const handleDeleteNeed = useCallback(async (groupId: string, needId: string) => {
    try {
      await fetch(`/api/visit-groups/${groupId}/needs/${needId}`, { method: 'DELETE' });
      await fetchGroupNeeds(groupId);
    } catch { /* silently fail */ }
  }, [fetchGroupNeeds]);

  // ── Sidebar need categories (static + QB inventory groups) ──
  const sidebarSections = useMemo(() => {
    const sections: { key: string; label: string; items: { name: string; type: string }[] }[] = [
      { key: 'manual', label: t('liveVisits', 'manuals'), items: [{ name: t('liveVisits', 'manuals'), type: 'manual' }] },
      { key: 'quote', label: t('liveVisits', 'quotes'), items: [{ name: t('liveVisits', 'quotes'), type: 'quote' }] },
      { key: 'info', label: 'Info', items: [{ name: 'Info', type: 'info' }] },
    ];
    // Group QB items by category or type
    if (qbInventory.length > 0) {
      const invItems = qbInventory.map(item => ({
        name: item.name,
        type: 'inventory',
      }));
      sections.unshift({
        key: 'inventory',
        label: t('liveVisits', 'inventory'),
        items: invItems,
      });
    }
    return sections;
  }, [qbInventory, t]);

  // ── Split groups by status ──
  const activeGroups = useMemo(() => visitGroups.filter(vg => vg.status === 'active'), [visitGroups]);
  const followUpGroups = useMemo(() =>
    visitGroups.filter(vg => vg.status === 'completed' && vg.expectedFollowUpAt),
    [visitGroups],
  );

  // ── Agenda: build visit-date map ──
  const visitDateMap = useMemo(() => {
    const map: Record<string, number> = {}; // "YYYY-MM-DD" → count
    for (const vg of visitGroups) {
      const dateStr = vg.startedAt?.slice(0, 10);
      if (dateStr) map[dateStr] = (map[dateStr] || 0) + (vg.visitors.length || 1);
    }
    return map;
  }, [visitGroups]);

  // ── Format helpers ──
  const formatTime = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatElapsed = (startedAt: string) => {
    const start = new Date(startedAt).getTime();
    const diff = Math.max(0, now.getTime() - start);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // ── Business display ──
  const getBusinessName = (vg: VisitGroup) => {
    if (vg.displayName) return vg.displayName;
    if (vg.managedClient) return vg.managedClient.companyName || vg.managedClient.displayName;
    if (vg.localBusiness) return vg.localBusiness.name;
    const firstCompany = vg.visitors.find(v => v.company)?.company;
    if (firstCompany) return firstCompany;
    return t('liveVisits', 'unnamedGroup');
  };

  const getBusinessType = (vg: VisitGroup): 'qb' | 'local' | null => {
    if (vg.managedClient) return 'qb';
    if (vg.localBusiness) return 'local';
    return null;
  };

  const isLinked = (vg: VisitGroup) => !!(vg.managedClient || vg.localBusiness);
  const totalVisitors = activeGroups.reduce((sum, vg) => sum + vg.visitors.length, 0);

  // ── Save group display name ──
  const handleSaveGroupName = async (groupId: string, name: string) => {
    setEditingNameGroupId(null);
    try {
      await fetch(`/api/visit-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name.trim() || null }),
      });
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  };

  // ── Drag-and-drop handlers ──
  const handleDragStart = (e: React.DragEvent, visitId: string, groupId: string) => {
    draggedVisitIdRef.current = visitId;
    draggedSourceGroupRef.current = groupId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', visitId);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    // Use 'copy' when dragging sidebar items, 'move' when dragging visitors
    e.dataTransfer.dropEffect = draggedSidebarItemRef.current ? 'copy' : 'move';
    setDragOverGroupId(groupId);
  };

  const handleDragLeave = () => setDragOverGroupId(null);

  const handleDrop = async (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    setDragOverGroupId(null);
    const visitId = draggedVisitIdRef.current || e.dataTransfer.getData('text/plain');
    if (!visitId || draggedSourceGroupRef.current === targetGroupId) return;
    try {
      await fetch(`/api/visits/${visitId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetGroupId }),
      });
      await fetchVisitGroups();
    } catch { /* silently fail */ }
    draggedVisitIdRef.current = null;
    draggedSourceGroupRef.current = null;
  };

  // ── Mobile move ──
  const handleMobileMove = async (visitId: string, targetGroupId: string) => {
    setMobileMovingVisitId(null);
    try {
      await fetch(`/api/visits/${visitId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetGroupId }),
      });
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  };

  // ── Create new group ──
  const handleCreateGroup = async () => {
    try {
      await fetch('/api/visit-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  };

  // ── Set main contact ──
  const handleSetMainContact = async (groupId: string, leadId: string) => {
    try {
      await fetch(`/api/visit-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainContactId: leadId }),
      });
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  };

  // ── Business search ──
  const searchBusinesses = useCallback(async (query: string) => {
    if (!query.trim()) { setBusinessResults([]); return; }
    setSearchingBusiness(true);
    try {
      const res = await fetch(`/api/kiosk/businesses?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const raw: any[] = Array.isArray(data) ? data : data.results || data.businesses || [];
      // Map API types to our interface types (managed → qb)
      const mapped: BusinessSearchResult[] = raw.map((b: any) => ({
        id: b.id,
        name: b.name,
        type: b.type === 'managed' ? 'qb' : b.type,
        managedClientId: b.type === 'managed' ? b.id : b.managedClientId,
        localBusinessId: b.type === 'local' ? b.id : b.localBusinessId,
      }));
      setBusinessResults(mapped);
    } catch { setBusinessResults([]); }
    setSearchingBusiness(false);
  }, []);

  useEffect(() => {
    if (!linkingGroupId) return;
    const timer = setTimeout(() => searchBusinesses(businessSearch), 300);
    return () => clearTimeout(timer);
  }, [businessSearch, linkingGroupId, searchBusinesses]);

  const handleLinkBusiness = async (groupId: string, biz: BusinessSearchResult) => {
    const body: Record<string, string> = {};
    if (biz.type === 'qb' && biz.managedClientId) body.managedClientId = biz.managedClientId;
    else if (biz.localBusinessId) body.localBusinessId = biz.localBusinessId;
    else body.localBusinessId = biz.id;
    try {
      await fetch(`/api/visit-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setLinkingGroupId(null); setBusinessSearch(''); setBusinessResults([]);
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  };

  const handleCreateAndLinkBusiness = async (groupId: string) => {
    if (!newBizForm.name.trim()) return;
    try {
      const res = await fetch('/api/local-businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBizForm),
      });
      const data = await res.json();
      const bizId = data.id || data.localBusiness?.id;
      if (bizId) {
        await fetch(`/api/visit-groups/${groupId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ localBusinessId: bizId }),
        });
      }
      setLinkingGroupId(null); setCreatingBusiness(false); setBusinessSearch(''); setBusinessResults([]);
      setNewBizForm({ name: '', address: '', city: '', province: '', phone: '', email: '' });
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  };

  // ── Expand / collapse helpers ──
  const expandGroup = useCallback((groupId: string) => {
    // Clear any pending collapse
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    setExpandedGroupId(groupId);
    // Auto-collapse after 30 seconds
    collapseTimerRef.current = setTimeout(() => setExpandedGroupId(null), 30000);
  }, []);

  const collapseGroup = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    setExpandedGroupId(null);
  }, []);

  const handleContainerClick = useCallback((groupId: string) => {
    if (expandedGroupId === groupId) {
      collapseGroup();
    } else {
      expandGroup(groupId);
    }
  }, [expandedGroupId, expandGroup, collapseGroup]);

  const handleContainerMouseEnter = useCallback((groupId: string) => {
    // Cancel any pending collapse when mouse re-enters any container
    if (collapseTimerRef.current) { clearTimeout(collapseTimerRef.current); collapseTimerRef.current = null; }
    if (expandedGroupId === groupId) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => expandGroup(groupId), 500);
  }, [expandedGroupId, expandGroup]);

  const handleContainerMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    // If a container is expanded, start a 5-second countdown to collapse
    if (expandedGroupId) {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = setTimeout(() => setExpandedGroupId(null), 5000);
    }
  }, [expandedGroupId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  // ── Agenda month data ──
  const monthNames = lang === 'fr' ? MONTH_NAMES_FR : MONTH_NAMES_EN;
  const dayHeaders = lang === 'fr'
    ? ['L', 'M', 'M', 'J', 'V', 'S', 'D']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const agendaMonths = useMemo(() => {
    // 4 months: offset-1, offset, offset+1, offset+2 (current in slot 2)
    return [-1, 0, 1, 2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() + agendaOffset + i, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, [now, agendaOffset]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 1 — AGENDA (white container)
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{t('liveVisits', 'agendaTitle')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAgendaOffset(o => o - 1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setAgendaOffset(0)}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
            >
              {t('liveVisits', 'today')}
            </button>
            <button
              onClick={() => setAgendaOffset(o => o + 1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          <div className="flex gap-4 min-w-0">
            {agendaMonths.map(({ year, month }) => {
              const daysInMonth = getDaysInMonth(year, month);
              const firstDay = getFirstDayOfWeek(year, month);
              const isCurrent = year === now.getFullYear() && month === now.getMonth() && agendaOffset === 0;

              return (
                <div
                  key={`${year}-${month}`}
                  className={`flex-shrink-0 w-[280px] rounded-xl border p-4 ${
                    isCurrent
                      ? 'border-brand-300 bg-brand-50/30'
                      : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  {/* Month + year */}
                  <p className={`text-sm font-semibold mb-3 ${isCurrent ? 'text-brand-700' : 'text-gray-700'}`}>
                    {monthNames[month]} {year}
                  </p>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {dayHeaders.map((d, i) => (
                      <div key={i} className="text-[10px] font-medium text-gray-400 text-center">{d}</div>
                    ))}
                  </div>

                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {/* Empty cells for offset */}
                    {Array.from({ length: firstDay }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-8" />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const count = visitDateMap[dateStr] || 0;
                      const isToday = dateStr === todayStr;

                      return (
                        <div
                          key={day}
                          className={`h-8 flex flex-col items-center justify-center rounded-md text-xs relative ${
                            isToday
                              ? 'bg-brand-600 text-white font-bold'
                              : count > 0
                              ? 'bg-brand-50 text-brand-700 font-medium'
                              : 'text-gray-500'
                          }`}
                        >
                          <span className="leading-none">{day}</span>
                          {count > 0 && !isToday && (
                            <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-brand-500" />
                          )}
                          {count > 0 && isToday && (
                            <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-white" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 2 — FOLLOW-UP NEEDED (white container)
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{t('liveVisits', 'followUpTitle')}</h2>
        </div>

        <div className="p-4">
          {followUpGroups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t('liveVisits', 'noFollowUps')}</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {followUpGroups.map(vg => (
                <div
                  key={vg.id}
                  className="flex-shrink-0 w-[300px] bg-gray-50 border border-gray-200 rounded-xl p-4"
                >
                  <p className="font-semibold text-gray-900 truncate">{getBusinessName(vg)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {vg.expectedFollowUpAt
                      ? new Date(vg.expectedFollowUpAt).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')
                      : ''}
                  </p>
                  {vg.notes && (
                    <p className="text-xs text-gray-400 mt-2 line-clamp-2">{vg.notes}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {vg.visitors.length} {t('liveVisits', 'visitors').toLowerCase()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 3 — LIVE VISITS (dark container)
          ════════════════════════════════════════════════════════════════════════ */}
      <div className={`bg-gray-950 border border-white/10 overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none flex flex-col'
          : 'rounded-2xl'
      }`}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-4 h-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </div>
            <h2 className="text-xl font-bold text-white">{t('liveVisits', 'liveTitle')}</h2>
          </div>
          <div className="flex items-center gap-6">
            <p className="text-lg font-semibold text-white tabular-nums">{formatTime(now)}</p>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
              <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span className="text-2xl font-bold text-white tabular-nums">{totalVisitors}</span>
              <span className="text-xs text-white/40">{t('liveVisits', 'visitors')}</span>
            </div>
            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(f => !f)}
              className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Live visit containers */}
        <div className={`p-6 ${isFullscreen ? 'flex-1 overflow-y-auto' : ''}`} style={{ minHeight: isFullscreen ? undefined : '75vh' }}>
          {activeGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-white/40">{t('liveVisits', 'noActiveVisits')}</p>
            </div>
          ) : (
            <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10">
              {activeGroups.map(vg => {
                const bizName = getBusinessName(vg);
                const bizType = getBusinessType(vg);
                const linked = isLinked(vg);
                const isLinking = linkingGroupId === vg.id;
                const isDragOver = dragOverGroupId === vg.id;
                const isEditingName = editingNameGroupId === vg.id;
                const isExpanded = expandedGroupId === vg.id;
                const isCollapsed = expandedGroupId !== null && expandedGroupId !== vg.id;

                // ── Collapsed view: just the business name ──
                if (isCollapsed) {
                  return (
                    <div
                      key={vg.id}
                      className="flex-shrink-0 w-[140px] bg-gray-900 border border-white/10 rounded-2xl overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-white/20 transition-all duration-300"
                      style={{ minHeight: 120 }}
                      onClick={() => handleContainerClick(vg.id)}
                      onMouseEnter={() => handleContainerMouseEnter(vg.id)}
                      onMouseLeave={handleContainerMouseLeave}
                      onDragOver={(e) => handleDragOver(e, vg.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, vg.id)}
                    >
                      <p className="text-sm font-semibold text-white/70 text-center px-3 truncate w-full">{bizName}</p>
                      <p className="text-xs text-white/30 mt-1">{vg.visitors.length} {t('liveVisits', 'visitors').toLowerCase()}</p>
                    </div>
                  );
                }

                // ── Normal or Expanded view ──
                const currentNeeds = groupNeeds[vg.id] || [];

                return (
                  <div
                    key={vg.id}
                    className={`flex-shrink-0 bg-gray-900 border rounded-2xl overflow-hidden transition-all duration-300 ${
                      isDragOver ? 'border-brand-500 bg-brand-500/5' : isExpanded ? 'border-brand-400/50' : 'border-white/10'
                    }`}
                    style={{ width: isExpanded ? 1050 : 350 }}
                    onClick={() => handleContainerClick(vg.id)}
                    onMouseEnter={() => handleContainerMouseEnter(vg.id)}
                    onMouseLeave={handleContainerMouseLeave}
                    onDragOver={(e) => handleDragOver(e, vg.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => {
                      // Handle sidebar item drops
                      const sidebarItem = draggedSidebarItemRef.current;
                      if (sidebarItem) {
                        e.preventDefault();
                        setDragOverGroupId(null);
                        handleSidebarDrop(vg.id, sidebarItem.name, sidebarItem.type);
                        draggedSidebarItemRef.current = null;
                        return;
                      }
                      handleDrop(e, vg.id);
                    }}
                  >
                    {/* ── Container header ── */}
                    <div className="p-4 border-b border-white/10" onClick={(e) => e.stopPropagation()}>
                      {/* Row 1: Business name + type badge + end visit */}
                      <div className="flex items-center gap-2 min-w-0">
                        {isEditingName ? (
                          <input
                            type="text"
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onBlur={() => handleSaveGroupName(vg.id, editingNameValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveGroupName(vg.id, editingNameValue);
                              if (e.key === 'Escape') setEditingNameGroupId(null);
                            }}
                            placeholder={t('liveVisits', 'businessName')}
                            className="flex-1 min-w-0 bg-gray-800 border border-brand-500 rounded-lg px-2 py-1 text-lg font-bold text-white placeholder-white/30 focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <h3 className="text-lg font-bold text-white truncate flex-1 min-w-0">{bizName}</h3>
                        )}
                        {bizType && (
                          <span className={`flex-shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            bizType === 'qb' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {bizType === 'qb' ? 'QB' : 'Local'}
                          </span>
                        )}
                        {/* End Visit button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm(t('liveVisits', 'endVisitConfirm'))) handleEndVisit(vg.id); }}
                          className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 text-xs font-semibold transition-colors"
                        >
                          {t('liveVisits', 'endVisit')}
                        </button>
                        {isExpanded && (
                          <button
                            onClick={(e) => { e.stopPropagation(); collapseGroup(); }}
                            className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                            title="Collapse"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Row 2: Action buttons — aligned row */}
                      <div className="flex items-center gap-3 mt-2">
                        {!linked && (
                          <button
                            onClick={() => {
                              setLinkingGroupId(isLinking ? null : vg.id);
                              setBusinessSearch(''); setBusinessResults([]); setCreatingBusiness(false);
                            }}
                            className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
                          >
                            {t('liveVisits', 'linkBusiness')}
                          </button>
                        )}
                        {!isEditingName && (
                          <button
                            onClick={() => {
                              setEditingNameGroupId(vg.id);
                              setEditingNameValue(vg.displayName || getBusinessName(vg));
                            }}
                            className="text-xs text-white/40 hover:text-white/70 font-medium transition-colors flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            {t('liveVisits', 'editName')}
                          </button>
                        )}
                      </div>

                      {/* ── Inline business linking panel ── */}
                      {isLinking && (
                        <div className="mt-3 p-3 bg-gray-800 rounded-xl border border-white/10 space-y-3">
                          {!creatingBusiness ? (
                            <>
                              <input
                                type="text"
                                value={businessSearch}
                                onChange={(e) => setBusinessSearch(e.target.value)}
                                placeholder={t('liveVisits', 'searchBusiness')}
                                className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500"
                                autoFocus
                              />
                              {searchingBusiness && (
                                <div className="flex justify-center py-2">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-500" />
                                </div>
                              )}
                              {businessResults.length > 0 && (
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {businessResults.map(biz => (
                                    <button
                                      key={biz.id}
                                      onClick={() => handleLinkBusiness(vg.id, biz)}
                                      className="w-full text-left px-3 py-2 rounded-lg bg-gray-900/50 hover:bg-gray-700 transition-colors flex items-center gap-2"
                                    >
                                      <span className="text-sm text-white flex-1 truncate">{biz.name}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                                        biz.type === 'qb' ? 'bg-blue-500/20 text-blue-300'
                                        : biz.type === 'local' ? 'bg-amber-500/20 text-amber-300'
                                        : 'bg-purple-500/20 text-purple-300'
                                      }`}>
                                        {biz.type === 'qb' ? 'QB' : biz.type === 'local' ? 'Local' : t('liveVisits', 'lead')}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => setCreatingBusiness(true)}
                                className="w-full text-sm text-brand-400 hover:text-brand-300 font-medium py-1 transition-colors"
                              >
                                + {t('liveVisits', 'createBusiness')}
                              </button>
                            </>
                          ) : (
                            <div className="space-y-2">
                              <input type="text" value={newBizForm.name} onChange={(e) => setNewBizForm(f => ({ ...f, name: e.target.value }))} placeholder={t('liveVisits', 'businessName') + ' *'} className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500" autoFocus />
                              <input type="text" value={newBizForm.address} onChange={(e) => setNewBizForm(f => ({ ...f, address: e.target.value }))} placeholder={t('liveVisits', 'address')} className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500" />
                              <div className="grid grid-cols-2 gap-2">
                                <input type="text" value={newBizForm.city} onChange={(e) => setNewBizForm(f => ({ ...f, city: e.target.value }))} placeholder={t('liveVisits', 'city')} className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500" />
                                <input type="text" value={newBizForm.province} onChange={(e) => setNewBizForm(f => ({ ...f, province: e.target.value }))} placeholder={t('liveVisits', 'province')} className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input type="text" value={newBizForm.phone} onChange={(e) => setNewBizForm(f => ({ ...f, phone: e.target.value }))} placeholder={t('liveVisits', 'phone')} className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500" />
                                <input type="email" value={newBizForm.email} onChange={(e) => setNewBizForm(f => ({ ...f, email: e.target.value }))} placeholder={t('liveVisits', 'email')} className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500" />
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => setCreatingBusiness(false)} className="flex-1 text-sm text-white/50 hover:text-white/70 py-1.5 transition-colors">{t('liveVisits', 'cancel')}</button>
                                <button onClick={() => handleCreateAndLinkBusiness(vg.id)} disabled={!newBizForm.name.trim()} className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium py-1.5 rounded-lg transition-colors">{t('liveVisits', 'create')}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Body: sidebar (expanded only) + visitor cards ── */}
                    <div className={`flex-1 flex ${isExpanded ? 'flex-row' : 'flex-col'}`} onClick={(e) => e.stopPropagation()}>

                      {/* ── SIDEBAR (only visible when expanded) ── */}
                      {isExpanded && (
                        <div className="w-[220px] flex-shrink-0 border-r border-white/10 p-3 overflow-y-auto">
                          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">{t('liveVisits', 'documents')}</p>
                          {sidebarSections.map(section => (
                            <div key={section.key} className="mb-1">
                              {/* Collapsible header */}
                              <button
                                onClick={() => setOpenSidebarSection(openSidebarSection === section.key ? null : section.key)}
                                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                              >
                                <span className="text-xs font-medium text-white/70">{section.label}</span>
                                <svg className={`w-3 h-3 text-white/40 transition-transform ${openSidebarSection === section.key ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>

                              {/* Collapsible items */}
                              {openSidebarSection === section.key && (
                                <div className="ml-1 mt-1 space-y-0.5 max-h-[200px] overflow-y-auto">
                                  {section.items.map((item, idx) => (
                                    <div
                                      key={idx}
                                      draggable="true"
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        draggedSidebarItemRef.current = { name: item.name, type: item.type };
                                        e.dataTransfer.effectAllowed = 'copyMove';
                                        e.dataTransfer.setData('application/sidebar-item', JSON.stringify(item));
                                        e.dataTransfer.setData('text/plain', item.name);
                                      }}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-800/50 border border-white/5 hover:border-white/15 cursor-grab active:cursor-grabbing text-xs text-white/60 hover:text-white/80 transition-colors"
                                    >
                                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <span className="truncate">{item.name}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}

                        </div>
                      )}

                      {/* ── Visitor cards + dropped needs column (also a drop target for sidebar items) ── */}
                      <div
                        className="flex-1 p-4 space-y-2 min-h-[80px]"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = draggedSidebarItemRef.current ? 'copy' : 'move';
                        }}
                        onDrop={(e) => {
                          const sidebarItem = draggedSidebarItemRef.current;
                          if (sidebarItem) {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverGroupId(null);
                            handleSidebarDrop(vg.id, sidebarItem.name, sidebarItem.type);
                            draggedSidebarItemRef.current = null;
                          }
                        }}
                      >
                        {vg.visitors.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-white/20 text-sm py-6">-</div>
                        ) : (
                          vg.visitors.map(visitor => (
                            <div
                              key={visitor.id}
                              draggable="true"
                              onDragStart={(e) => handleDragStart(e, visitor.id, vg.id)}
                              className="group flex items-center gap-3 p-2.5 rounded-xl bg-gray-800/50 border border-white/5 hover:border-white/15 cursor-grab active:cursor-grabbing transition-colors relative"
                            >
                              {/* Drag handle */}
                              <div className="flex flex-col gap-[2px] opacity-30 group-hover:opacity-60 transition-opacity flex-shrink-0">
                                {[0, 1, 2].map(r => (
                                  <div key={r} className="flex gap-[2px]">
                                    <span className="w-1 h-1 bg-white/60 rounded-full" />
                                    <span className="w-1 h-1 bg-white/60 rounded-full" />
                                  </div>
                                ))}
                              </div>

                              {/* Avatar */}
                              {visitor.photo ? (
                                <img src={visitor.photo} alt={visitor.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-white/10" />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-brand-600/30 flex items-center justify-center flex-shrink-0 border border-white/10">
                                  <span className="text-sm font-bold text-brand-300">{visitor.name.charAt(0).toUpperCase()}</span>
                                </div>
                              )}

                              {/* Info */}
                              <div className="min-w-0 flex-1">
                                <button
                                  onClick={() => handleSetMainContact(vg.id, visitor.leadId)}
                                  className="flex items-center gap-1.5 text-left w-full"
                                  title={t('liveVisits', 'setMainContact')}
                                >
                                  <span className="text-sm font-medium text-white truncate hover:text-brand-300 transition-colors">{visitor.name}</span>
                                  {visitor.isMainContact && (
                                    <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                                    </svg>
                                  )}
                                </button>
                                {(visitor.email || visitor.company) && (
                                  <p className="text-xs text-white/40 truncate">{visitor.email || visitor.company}</p>
                                )}
                              </div>

                              {/* Mobile move */}
                              <button
                                onClick={(e) => { e.stopPropagation(); setMobileMovingVisitId(mobileMovingVisitId === visitor.id ? null : visitor.id); }}
                                className="md:hidden flex-shrink-0 p-1 rounded text-white/30 hover:text-white/60 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                              </button>

                              {mobileMovingVisitId === visitor.id && (
                                <div className="absolute top-full right-0 mt-1 z-20 bg-gray-800 border border-white/10 rounded-xl shadow-xl py-1 min-w-[180px]">
                                  <p className="px-3 py-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">{t('liveVisits', 'moveTo')}</p>
                                  {activeGroups.filter(g => g.id !== vg.id).map(g => (
                                    <button key={g.id} onClick={() => handleMobileMove(visitor.id, g.id)} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors truncate">
                                      {getBusinessName(g)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        )}

                        {/* ── Dropped needs (appear under visitor names) ── */}
                        {currentNeeds.length > 0 && (
                          <div className="pt-2 mt-2 border-t border-white/5 space-y-1.5">
                            {currentNeeds.map(need => (
                              <div key={need.id} className="px-2 py-1.5">
                                <div className="flex items-center gap-2">
                                  {/* Remove button (−) */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteNeed(vg.id, need.id); }}
                                    className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500/15 hover:bg-red-500/30 text-red-400 hover:text-red-300 flex items-center justify-center transition-colors"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                                    </svg>
                                  </button>
                                  {/* Need title — bigger, white */}
                                  <span className="text-sm font-semibold text-white truncate flex-1">{need.description || need.type}</span>
                                  {/* Add note button (+) */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingNeedId(editingNeedId === need.id ? null : need.id); setNeedNoteValue(''); }}
                                    className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 hover:text-brand-300 flex items-center justify-center transition-colors"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                  </button>
                                </div>
                                {editingNeedId === need.id && (
                                  <input
                                    type="text"
                                    value={needNoteValue}
                                    onChange={(e) => setNeedNoteValue(e.target.value)}
                                    placeholder={t('liveVisits', 'addNote')}
                                    className="mt-1.5 w-full bg-transparent border-0 border-b border-white/10 px-0 py-0.5 text-[11px] text-white/50 placeholder-white/25 focus:outline-none focus:border-brand-500/50 font-light"
                                    autoFocus
                                    onBlur={async () => {
                                      if (needNoteValue.trim()) {
                                        try {
                                          await fetch(`/api/visit-groups/${vg.id}/needs`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ type: need.type, description: `${need.description || need.type}: ${needNoteValue.trim()}` }),
                                          });
                                          fetchGroupNeeds(vg.id);
                                        } catch {}
                                      }
                                      setEditingNeedId(null); setNeedNoteValue('');
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                      if (e.key === 'Escape') { setNeedNoteValue(''); setEditingNeedId(null); }
                                    }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Footer ── */}
                    <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{t('liveVisits', 'visitingSince')} {formatElapsed(vg.startedAt)}</span>
                      </div>
                      <span>{vg.visitors.length} {t('liveVisits', 'visitors').toLowerCase()}</span>
                    </div>
                  </div>
                );
              })}

              {/* ── "+" card ── */}
              <button
                onClick={handleCreateGroup}
                className="flex-shrink-0 w-[350px] bg-gray-900/50 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-brand-500/50 hover:bg-brand-500/5 transition-colors min-h-[200px] cursor-pointer"
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={async (e) => {
                  e.preventDefault();
                  const visitId = draggedVisitIdRef.current || e.dataTransfer.getData('text/plain');
                  if (!visitId) return;
                  try {
                    const res = await fetch('/api/visit-groups', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'active' }),
                    });
                    const data = await res.json();
                    const newGroupId = data.id || data.visitGroup?.id;
                    if (newGroupId) {
                      await fetch(`/api/visits/${visitId}/move`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targetGroupId: newGroupId }),
                      });
                    }
                    await fetchVisitGroups();
                  } catch { /* silently fail */ }
                  draggedVisitIdRef.current = null;
                  draggedSourceGroupRef.current = null;
                }}
              >
                <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <span className="text-sm text-white/30 font-medium">{t('liveVisits', 'newGroup')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
