'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  managedClient: { id: string; companyName: string; displayName: string } | null;
  localBusiness: { id: string; name: string } | null;
  visitors: Visitor[];
  visitCount?: number;
}

interface BusinessSearchResult {
  id: string;
  name: string;
  type: 'qb' | 'local' | 'lead';
  managedClientId?: string;
  localBusinessId?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LiveVisitsPage() {
  const { t } = useLanguage();

  const [visitGroups, setVisitGroups] = useState<VisitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

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

  // Mobile move dropdown
  const [mobileMovingVisitId, setMobileMovingVisitId] = useState<string | null>(null);

  // ── Fetch visit groups ──
  const fetchVisitGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/visit-groups?status=active');
      const data = await res.json();
      const raw = data.visitGroups || (Array.isArray(data) ? data : []);
      // Transform API shape → frontend shape
      const transformed: VisitGroup[] = raw.map((vg: any) => ({
        id: vg.id,
        status: vg.status,
        startedAt: vg.createdAt,
        managedClient: vg.managedClient || null,
        localBusiness: vg.localBusiness || null,
        visitCount: vg.visits?.length ?? vg._count?.visits ?? 0,
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

  // ── Clock tick (every second) ──
  useEffect(() => {
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // ── Auto-refresh data (every 10 seconds) ──
  useEffect(() => {
    fetchVisitGroups();
    const dataInterval = setInterval(fetchVisitGroups, 10000);
    return () => clearInterval(dataInterval);
  }, [fetchVisitGroups]);

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
    if (vg.managedClient) return vg.managedClient.companyName || vg.managedClient.displayName;
    if (vg.localBusiness) return vg.localBusiness.name;
    // Fallback to first visitor's company
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

  const totalVisitors = visitGroups.reduce((sum, vg) => sum + vg.visitors.length, 0);

  // ── Drag-and-drop handlers ──
  const handleDragStart = (e: React.DragEvent, visitId: string, groupId: string) => {
    draggedVisitIdRef.current = visitId;
    draggedSourceGroupRef.current = groupId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', visitId);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupId(groupId);
  };

  const handleDragLeave = () => {
    setDragOverGroupId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    setDragOverGroupId(null);
    const visitId = draggedVisitIdRef.current || e.dataTransfer.getData('text/plain');
    if (!visitId) return;
    if (draggedSourceGroupRef.current === targetGroupId) return;

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

  // ── Mobile move handler ──
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

  // ── Create new group (the "+" card) ──
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
    if (!query.trim()) {
      setBusinessResults([]);
      return;
    }
    setSearchingBusiness(true);
    try {
      const res = await fetch(`/api/kiosk/businesses?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setBusinessResults(Array.isArray(data) ? data : data.businesses || []);
    } catch {
      setBusinessResults([]);
    }
    setSearchingBusiness(false);
  }, []);

  useEffect(() => {
    if (!linkingGroupId) return;
    const timer = setTimeout(() => searchBusinesses(businessSearch), 300);
    return () => clearTimeout(timer);
  }, [businessSearch, linkingGroupId, searchBusinesses]);

  // ── Link business to group ──
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
      setLinkingGroupId(null);
      setBusinessSearch('');
      setBusinessResults([]);
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  };

  // ── Create new local business and link ──
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
      setLinkingGroupId(null);
      setCreatingBusiness(false);
      setBusinessSearch('');
      setBusinessResults([]);
      setNewBizForm({ name: '', address: '', city: '', province: '', phone: '', email: '' });
      await fetchVisitGroups();
    } catch { /* silently fail */ }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-950 text-white select-none">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center justify-between max-w-[1920px] mx-auto">
          {/* Left: Pulsing dot + title */}
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-4 h-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">{t('liveVisits', 'title')}</h1>
          </div>

          {/* Right: Clock + visitor count */}
          <div className="flex items-center gap-6">
            <p className="text-xl font-semibold text-white tabular-nums">{formatTime(now)}</p>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
              <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span className="text-2xl font-bold text-white tabular-nums">{totalVisitors}</span>
              <span className="text-xs text-white/40">{t('liveVisits', 'visitors')}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <main className="p-6 max-w-[1920px] mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-[70vh]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500" />
          </div>
        ) : visitGroups.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-[70vh] text-center">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-white/40">{t('liveVisits', 'noActiveVisits')}</p>
          </div>
        ) : (
          /* ── Horizontal scrolling row of containers ── */
          <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10">
            {visitGroups.map(vg => {
              const bizName = getBusinessName(vg);
              const bizType = getBusinessType(vg);
              const linked = isLinked(vg);
              const isLinking = linkingGroupId === vg.id;
              const isDragOver = dragOverGroupId === vg.id;

              return (
                <div
                  key={vg.id}
                  className={`flex-shrink-0 w-[350px] bg-gray-900 border rounded-2xl overflow-hidden flex flex-col transition-colors ${
                    isDragOver
                      ? 'border-brand-500 bg-brand-500/5'
                      : 'border-white/10'
                  }`}
                  onDragOver={(e) => handleDragOver(e, vg.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, vg.id)}
                >
                  {/* ── Container header ── */}
                  <div className="p-4 border-b border-white/10">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-white truncate">{bizName}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          {bizType && (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                              bizType === 'qb'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {bizType === 'qb' ? 'QB' : 'Local'}
                            </span>
                          )}
                        </div>
                      </div>
                      {!linked && (
                        <button
                          onClick={() => {
                            setLinkingGroupId(isLinking ? null : vg.id);
                            setBusinessSearch('');
                            setBusinessResults([]);
                            setCreatingBusiness(false);
                          }}
                          className="text-xs text-brand-400 hover:text-brand-300 font-medium whitespace-nowrap transition-colors"
                        >
                          {t('liveVisits', 'linkBusiness')}
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
                          /* ── Inline create business form ── */
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={newBizForm.name}
                              onChange={(e) => setNewBizForm(f => ({ ...f, name: e.target.value }))}
                              placeholder={t('liveVisits', 'businessName') + ' *'}
                              className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500"
                              autoFocus
                            />
                            <input
                              type="text"
                              value={newBizForm.address}
                              onChange={(e) => setNewBizForm(f => ({ ...f, address: e.target.value }))}
                              placeholder={t('liveVisits', 'address')}
                              className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={newBizForm.city}
                                onChange={(e) => setNewBizForm(f => ({ ...f, city: e.target.value }))}
                                placeholder={t('liveVisits', 'city')}
                                className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500"
                              />
                              <input
                                type="text"
                                value={newBizForm.province}
                                onChange={(e) => setNewBizForm(f => ({ ...f, province: e.target.value }))}
                                placeholder={t('liveVisits', 'province')}
                                className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={newBizForm.phone}
                                onChange={(e) => setNewBizForm(f => ({ ...f, phone: e.target.value }))}
                                placeholder={t('liveVisits', 'phone')}
                                className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500"
                              />
                              <input
                                type="email"
                                value={newBizForm.email}
                                onChange={(e) => setNewBizForm(f => ({ ...f, email: e.target.value }))}
                                placeholder={t('liveVisits', 'email')}
                                className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500"
                              />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => setCreatingBusiness(false)}
                                className="flex-1 text-sm text-white/50 hover:text-white/70 py-1.5 transition-colors"
                              >
                                {t('liveVisits', 'cancel')}
                              </button>
                              <button
                                onClick={() => handleCreateAndLinkBusiness(vg.id)}
                                disabled={!newBizForm.name.trim()}
                                className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium py-1.5 rounded-lg transition-colors"
                              >
                                {t('liveVisits', 'create')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Visitor cards ── */}
                  <div className="flex-1 p-4 space-y-2 min-h-[80px]">
                    {vg.visitors.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-white/20 text-sm py-6">
                        -
                      </div>
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
                            <div className="flex gap-[2px]">
                              <span className="w-1 h-1 bg-white/60 rounded-full" />
                              <span className="w-1 h-1 bg-white/60 rounded-full" />
                            </div>
                            <div className="flex gap-[2px]">
                              <span className="w-1 h-1 bg-white/60 rounded-full" />
                              <span className="w-1 h-1 bg-white/60 rounded-full" />
                            </div>
                            <div className="flex gap-[2px]">
                              <span className="w-1 h-1 bg-white/60 rounded-full" />
                              <span className="w-1 h-1 bg-white/60 rounded-full" />
                            </div>
                          </div>

                          {/* Avatar */}
                          {visitor.photo ? (
                            <img
                              src={visitor.photo}
                              alt={visitor.name}
                              className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-white/10"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-brand-600/30 flex items-center justify-center flex-shrink-0 border border-white/10">
                              <span className="text-sm font-bold text-brand-300">
                                {visitor.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <button
                              onClick={() => handleSetMainContact(vg.id, visitor.leadId)}
                              className="flex items-center gap-1.5 text-left w-full"
                              title={t('liveVisits', 'setMainContact')}
                            >
                              <span className="text-sm font-medium text-white truncate hover:text-brand-300 transition-colors">
                                {visitor.name}
                              </span>
                              {visitor.isMainContact && (
                                <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                                </svg>
                              )}
                            </button>
                            {(visitor.email || visitor.company) && (
                              <p className="text-xs text-white/40 truncate">
                                {visitor.email || visitor.company}
                              </p>
                            )}
                          </div>

                          {/* Mobile: "Move to" button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileMovingVisitId(
                                mobileMovingVisitId === visitor.id ? null : visitor.id,
                              );
                            }}
                            className="md:hidden flex-shrink-0 p-1 rounded text-white/30 hover:text-white/60 transition-colors"
                            title={t('liveVisits', 'moveTo')}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          </button>

                          {/* Mobile move dropdown */}
                          {mobileMovingVisitId === visitor.id && (
                            <div className="absolute top-full right-0 mt-1 z-20 bg-gray-800 border border-white/10 rounded-xl shadow-xl py-1 min-w-[180px]">
                              <p className="px-3 py-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                                {t('liveVisits', 'moveTo')}
                              </p>
                              {visitGroups
                                .filter(g => g.id !== vg.id)
                                .map(g => (
                                  <button
                                    key={g.id}
                                    onClick={() => handleMobileMove(visitor.id, g.id)}
                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors truncate"
                                  >
                                    {getBusinessName(g)}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* ── Container footer ── */}
                  <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{t('liveVisits', 'visitingSince')} {formatElapsed(vg.startedAt)}</span>
                    </div>
                    <span>
                      {vg.visitors.length} {t('liveVisits', 'visitors').toLowerCase()}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* ── "+" card to create new group ── */}
            <button
              onClick={handleCreateGroup}
              className="flex-shrink-0 w-[350px] bg-gray-900/50 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-brand-500/50 hover:bg-brand-500/5 transition-colors min-h-[200px] cursor-pointer"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={async (e) => {
                e.preventDefault();
                const visitId = draggedVisitIdRef.current || e.dataTransfer.getData('text/plain');
                if (!visitId) return;
                // Create group then move into it
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
      </main>
    </div>
  );
}
