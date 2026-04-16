'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface VisitNeed {
  id: string;
  type: 'info' | 'quote' | 'manual' | 'photos' | 'videos' | 'reports' | 'other';
  description: string;
  status: 'pending' | 'in_progress' | 'sent' | 'completed';
}

interface Visitor {
  id: string;
  name: string;
  email: string | null;
  photo: string | null;
  isMainContact: boolean;
}

interface VisitGroup {
  id: string;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: string;
  expectedFollowUpAt: string | null;
  notes: string | null;
  managedClient: { id: string; companyName: string; displayName: string } | null;
  localBusiness: { id: string; name: string; address: string | null; lat: number | null; lng: number | null } | null;
  visitors: Visitor[];
  needs: VisitNeed[];
}

// ── Need type icons (emoji-style) ───────────────────────────────────────────

const NEED_TYPE_ICONS: Record<string, string> = {
  info: '\u2139\uFE0F',
  quote: '$',
  manual: '\uD83D\uDCD6',
  photos: '\uD83D\uDCF7',
  videos: '\uD83C\uDFA5',
  reports: '\uD83D\uDCCA',
  other: '\uD83D\uDCCC',
};

const NEED_STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  in_progress: 'bg-blue-500/20 text-blue-300',
  sent: 'bg-green-500/20 text-green-300',
  completed: 'bg-green-500/20 text-green-300',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function LiveVisitsPage() {
  const { t } = useLanguage();

  const [visitGroups, setVisitGroups] = useState<VisitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // ── Fetch visit groups ──
  const fetchVisitGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/visit-groups?status=active');
      const data = await res.json();
      if (data.visitGroups) setVisitGroups(data.visitGroups);
      else if (Array.isArray(data)) setVisitGroups(data);
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
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatElapsed = (startedAt: string) => {
    const start = new Date(startedAt).getTime();
    const diff = Math.max(0, now.getTime() - start);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatFollowUp = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return d;
    }
  };

  // ── Get business display info ──
  const getBusinessName = (vg: VisitGroup) => {
    if (vg.managedClient) return vg.managedClient.companyName || vg.managedClient.displayName;
    if (vg.localBusiness) return vg.localBusiness.name;
    return t('liveVisits', 'individualVisitor');
  };

  const getBusinessType = (vg: VisitGroup): 'qb' | 'local' | null => {
    if (vg.managedClient) return 'qb';
    if (vg.localBusiness) return 'local';
    return null;
  };

  const getBusinessAddress = (vg: VisitGroup): string | null => {
    if (vg.localBusiness?.address) return vg.localBusiness.address;
    return null;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center justify-between max-w-[1920px] mx-auto">
          {/* Left: Title + pulsing dot */}
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-4 h-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{t('liveVisits', 'title')}</h1>
              <p className="text-sm text-white/40">{t('liveVisits', 'subtitle')}</p>
            </div>
          </div>

          {/* Right: Date/time + visitor count */}
          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-lg font-semibold text-white tabular-nums">{formatTime(now)}</p>
              <p className="text-sm text-white/40">{formatDate(now)}</p>
            </div>
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-5 py-3">
              {/* Users icon */}
              <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <div>
                <p className="text-2xl font-bold text-white tabular-nums">
                  {visitGroups.reduce((sum, vg) => sum + vg.visitors.length, 0)}
                </p>
                <p className="text-xs text-white/40">{t('liveVisits', 'visitors')}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <main className="p-6 max-w-[1920px] mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500" />
          </div>
        ) : visitGroups.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
              {/* Calendar/clock icon */}
              <svg className="w-12 h-12 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-white/40">{t('liveVisits', 'noActiveVisits')}</p>
          </div>
        ) : (
          /* ── Visit group cards grid ── */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visitGroups.map(vg => {
              const bizName = getBusinessName(vg);
              const bizType = getBusinessType(vg);
              const bizAddress = getBusinessAddress(vg);

              return (
                <div
                  key={vg.id}
                  className="bg-gray-900 border border-white/10 rounded-2xl overflow-hidden flex flex-col"
                >
                  {/* ── Card top: business info + visitors ── */}
                  <div className="flex flex-col lg:flex-row">
                    {/* Left section: Business info */}
                    <div className="flex-1 p-5 border-b lg:border-b-0 lg:border-r border-white/10">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-bold text-white truncate">{bizName}</h3>
                          {bizType && (
                            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              bizType === 'qb'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {bizType === 'qb' ? t('liveVisits', 'qbClient') : t('liveVisits', 'localBusiness')}
                            </span>
                          )}
                        </div>
                      </div>

                      {bizAddress && (
                        <div className="flex items-start gap-2 mb-3">
                          <svg className="w-4 h-4 text-white/40 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <p className="text-sm text-white/60">{bizAddress}</p>
                        </div>
                      )}

                      {/* Street View placeholder */}
                      <div className="rounded-xl bg-gray-800 border border-white/5 h-32 flex items-center justify-center mb-2">
                        {/*
                          TODO: Replace with Google Street View embed when API key is available:
                          <iframe
                            src={`https://www.google.com/maps/embed/v1/streetview?key=YOUR_KEY&location=${lat},${lng}`}
                            className="w-full h-full rounded-xl"
                            allowFullScreen
                          />
                        */}
                        <div className="flex flex-col items-center gap-2 text-white/20">
                          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                          <span className="text-xs">Street View</span>
                        </div>
                      </div>

                      {/* Map placeholder */}
                      <div className="rounded-xl bg-gray-800 border border-white/5 h-24 flex items-center justify-center">
                        {/*
                          TODO: Replace with Google Map embed when API key is available:
                          <iframe
                            src={`https://www.google.com/maps/embed/v1/place?key=YOUR_KEY&q=${lat},${lng}`}
                            className="w-full h-full rounded-xl"
                            allowFullScreen
                          />
                        */}
                        <div className="flex flex-col items-center gap-1 text-white/20">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                          </svg>
                          <span className="text-xs">Map</span>
                        </div>
                      </div>
                    </div>

                    {/* Right section: Visitors */}
                    <div className="lg:w-64 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider">{t('liveVisits', 'visitors')}</h4>
                        <div className="flex items-center gap-1.5 text-white/40">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs">
                            {t('liveVisits', 'visitingSince')} {formatElapsed(vg.startedAt)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {vg.visitors.map(visitor => (
                          <div key={visitor.id} className="flex items-center gap-3">
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
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-white truncate">{visitor.name}</p>
                                {visitor.isMainContact && (
                                  <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                                  </svg>
                                )}
                              </div>
                              {visitor.email && (
                                <p className="text-xs text-white/40 truncate">{visitor.email}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {vg.visitors.length === 0 && (
                          <p className="text-sm text-white/30 text-center py-4">-</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Card bottom: Needs + follow-up + notes ── */}
                  <div className="border-t border-white/10 p-5 space-y-4">
                    {/* Visit Needs */}
                    {vg.needs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">{t('liveVisits', 'needs')}</h4>
                        <div className="space-y-2">
                          {vg.needs.map(need => (
                            <div key={need.id} className="flex items-center gap-3">
                              <span className="text-base flex-shrink-0 w-6 text-center">{NEED_TYPE_ICONS[need.type] || NEED_TYPE_ICONS.other}</span>
                              <span className="text-sm text-white/80 flex-1 truncate">
                                {need.description || t('liveVisits', `need_${need.type}`)}
                              </span>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${NEED_STATUS_CLASSES[need.status] || NEED_STATUS_CLASSES.pending}`}>
                                {t('liveVisits', `status_${need.status}`)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expected follow-up */}
                    {vg.expectedFollowUpAt && (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        <span className="text-xs text-white/40">{t('liveVisits', 'expectedFollowUp')}:</span>
                        <span className="text-xs text-white/70">{formatFollowUp(vg.expectedFollowUpAt)}</span>
                      </div>
                    )}

                    {/* Notes */}
                    {vg.notes && (
                      <div>
                        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">{t('liveVisits', 'notes')}</h4>
                        <p className="text-sm text-white/60 whitespace-pre-wrap">{vg.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
