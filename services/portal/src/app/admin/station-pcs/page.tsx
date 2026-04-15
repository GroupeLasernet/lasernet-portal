'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

interface StationPC {
  id: string;
  serial: string;
  macAddress: string | null;
  hostname: string | null;
  nickname: string | null;
  installedAt: string;
  robotVersion: string | null;
  relfarVersion: string | null;
  lastHeartbeatAt: string | null;
  lastHeartbeatIp: string | null;
  status: 'provisioning' | 'online' | 'offline' | 'retired';
  approved: boolean;
  notes: string | null;
  station: {
    id: string;
    stationNumber: string;
    title: string;
    status: string;
    client: { id: string; displayName: string; companyName: string };
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface StationLite {
  id: string;
  stationNumber: string;
  title: string;
  clientName: string;
  stationPCId: string | null;
}

type StatusFilter = 'all' | 'pending' | 'provisioning' | 'online' | 'offline' | 'retired';

// Any PC whose server-reported status is `online` but whose last heartbeat is
// older than STALE_MS should be shown to the operator as effectively offline.
// This is a display-only override — the next heartbeat will reconcile the DB.
const STALE_MS = 6 * 60 * 1000;

function displayStatus(pc: StationPC): StationPC['status'] {
  if (pc.status === 'online' || pc.status === 'provisioning') {
    if (pc.lastHeartbeatAt) {
      const age = Date.now() - Date.parse(pc.lastHeartbeatAt);
      if (Number.isFinite(age) && age > STALE_MS) return 'offline';
    }
  }
  return pc.status;
}

const STATUS_STYLES: Record<StationPC['status'], { label: (t: TFn) => string; dot: string; chip: string }> = {
  provisioning: {
    label: (t) => t('stationPcs', 'statusProvisioning'),
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-800',
  },
  online: {
    label: (t) => t('stationPcs', 'statusOnline'),
    dot: 'bg-green-500',
    chip: 'bg-green-100 text-green-800',
  },
  offline: {
    label: (t) => t('stationPcs', 'statusOffline'),
    dot: 'bg-red-500',
    chip: 'bg-red-100 text-red-800',
  },
  retired: {
    label: (t) => t('stationPcs', 'statusRetired'),
    dot: 'bg-gray-400',
    chip: 'bg-gray-100 text-gray-700',
  },
};

type TFn = (section: string, key: string) => string;

export default function StationPCsPage() {
  const { t } = useLanguage();
  const [pcs, setPcs] = useState<StationPC[]>([]);
  const [stations, setStations] = useState<StationLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StationPC | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // New-PC form state
  const [formSerial, setFormSerial] = useState('');
  const [formMac, setFormMac] = useState('');
  const [formHostname, setFormHostname] = useState('');
  const [formNickname, setFormNickname] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Installer-generator modal state
  const [showInstallerModal, setShowInstallerModal] = useState(false);
  const [installerPortalUrl, setInstallerPortalUrl] = useState('');
  // Pre-fill the portal URL field with whatever origin the operator is
  // currently browsing from — almost always what they want baked in.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setInstallerPortalUrl(window.location.origin);
    }
  }, []);

  const handleDownloadInstaller = () => {
    const url = installerPortalUrl.trim();
    if (!url) return;
    const href = `/api/admin/station-installer/generate?portalUrl=${encodeURIComponent(url)}`;
    // Simple anchor click → triggers browser download via Content-Disposition.
    const a = document.createElement('a');
    a.href = href;
    a.download = 'atelier-dsm-station-install.cmd';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowInstallerModal(false);
  };

  const fetchPCs = useCallback(async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams();
      // 'pending' and 'offline' are client-side derived filters — we still
      // fetch everything and filter below so the display-only stale override
      // can recategorise rows that the server thinks are `online`.
      if (status !== 'all' && status !== 'pending' && status !== 'offline') {
        qs.set('status', status);
      }
      if (search.trim()) qs.set('search', search.trim());
      const res = await fetch(`/api/station-pcs?${qs.toString()}`);
      const data = await res.json();
      setPcs(data.stationPCs || []);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    fetchPCs();
  }, [fetchPCs]);

  // Station list for the assignment picker
  useEffect(() => {
    fetch('/api/stations')
      .then((r) => r.json())
      .then((data) => {
        const rows = data.stations || [];
        setStations(
          rows.map((s: Record<string, unknown>) => ({
            id: s.id as string,
            stationNumber: s.stationNumber as string,
            title: s.title as string,
            clientName:
              (s.client as { displayName?: string } | undefined)?.displayName || '',
            stationPCId: (s as { stationPCId?: string | null }).stationPCId ?? null,
          }))
        );
      })
      .catch(() => setStations([]));
  }, []);

  const resetForm = () => {
    setFormSerial('');
    setFormMac('');
    setFormHostname('');
    setFormNickname('');
    setFormNotes('');
    setFormError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/station-pcs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: formSerial,
          macAddress: formMac || undefined,
          hostname: formHostname || undefined,
          nickname: formNickname || undefined,
          notes: formNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || t('stationPcs', 'createFailed'));
        return;
      }
      resetForm();
      setShowNewModal(false);
      fetchPCs();
    } catch {
      setFormError(t('stationPcs', 'createFailed'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleAssignStation = async (pc: StationPC, stationId: string | null) => {
    // If the operator is detaching this PC from its current station, warn them:
    // per product spec, unlinking sends the PC back to the "To be approved" queue.
    if (stationId === null && pc.station) {
      if (!confirm(t('stationPcs', 'confirmUnassign'))) return;
    }
    try {
      const res = await fetch(`/api/station-pcs/${pc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignToStationId: stationId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSelected(data.stationPC);
      fetchPCs();
    } catch {
      // no-op
    }
  };

  const handleRetire = async (pc: StationPC) => {
    if (!confirm(t('stationPcs', 'confirmRetire'))) return;
    await fetch(`/api/station-pcs/${pc.id}`, { method: 'DELETE' });
    if (selected?.id === pc.id) setSelected(null);
    fetchPCs();
  };

  const handleApprove = async (pc: StationPC) => {
    try {
      const res = await fetch(`/api/station-pcs/${pc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSelected(data.stationPC);
      fetchPCs();
    } catch {
      // no-op
    }
  };

  // Apply the 'pending' and stale-offline client-side derivations.
  const filtered = pcs.filter((pc) => {
    if (status === 'pending') return !pc.approved;
    if (status === 'offline') return displayStatus(pc) === 'offline';
    return true;
  });

  return (
    <div>
      <PageHeader
        title={t('stationPcs', 'title')}
        subtitle={t('stationPcs', 'subtitle')}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowInstallerModal(true)}
              className="btn-secondary"
            >
              {t('stationPcs', 'generateInstaller')}
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowNewModal(true);
              }}
              className="btn-primary"
            >
              + {t('stationPcs', 'newPC')}
            </button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['all', 'pending', 'online', 'offline', 'provisioning', 'retired'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                status === s ? 'bg-white shadow text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('stationPcs', `filter_${s}`)}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('stationPcs', 'searchPlaceholder')}
          className="input-field flex-1 min-w-[240px] max-w-md"
        />
      </div>

      {/* List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: PC list */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">{t('stationPcs', 'loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">{t('stationPcs', 'emptyState')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">{t('stationPcs', 'colSerial')}</th>
                  <th className="px-4 py-3">{t('stationPcs', 'colMac')}</th>
                  <th className="px-4 py-3">{t('stationPcs', 'colStation')}</th>
                  <th className="px-4 py-3">{t('stationPcs', 'colStatus')}</th>
                  <th className="px-4 py-3">{t('stationPcs', 'colHeartbeat')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((pc) => {
                  const effective = displayStatus(pc);
                  const style = STATUS_STYLES[effective];
                  const isSelected = selected?.id === pc.id;
                  return (
                    <tr
                      key={pc.id}
                      onClick={() => setSelected(pc)}
                      className={`cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-brand-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-900">
                        <div className="font-semibold">{pc.serial}</div>
                        {pc.nickname && (
                          <div className="text-xs text-gray-500 font-sans mt-0.5">{pc.nickname}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {pc.macAddress || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {pc.station ? (
                          <div>
                            <div className="text-gray-900 font-medium">{pc.station.stationNumber}</div>
                            <div className="text-xs text-gray-500">{pc.station.client.displayName}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">{t('stationPcs', 'unassigned')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${style.chip}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            {style.label(t)}
                          </span>
                          {!pc.approved && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                              {t('stationPcs', 'pending')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {pc.lastHeartbeatAt
                          ? new Date(pc.lastHeartbeatAt).toLocaleString()
                          : <span className="text-gray-400">{t('stationPcs', 'never')}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: selected detail */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {!selected ? (
            <div className="text-center text-gray-500 py-12">
              <p className="text-sm">{t('stationPcs', 'selectPrompt')}</p>
            </div>
          ) : (
            <StationPCDetail
              pc={selected}
              stations={stations}
              onAssign={handleAssignStation}
              onRetire={handleRetire}
              onApprove={handleApprove}
              onChange={(updated) => {
                setSelected(updated);
                fetchPCs();
              }}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Installer-generator modal */}
      {showInstallerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowInstallerModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {t('stationPcs', 'generateInstallerTitle')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('stationPcs', 'generateInstallerBody')}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('stationPcs', 'generateInstallerPortalUrl')}
                </label>
                <input
                  type="url"
                  value={installerPortalUrl}
                  onChange={(e) => setInstallerPortalUrl(e.target.value)}
                  className="input-field"
                  placeholder="https://portal.atelierdsm.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('stationPcs', 'generateInstallerPortalUrlHint')}
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg p-3 leading-relaxed">
                {t('stationPcs', 'generateInstallerHowTo')}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShowInstallerModal(false)}
                className="btn-secondary"
              >
                {t('common', 'cancel')}
              </button>
              <button
                type="button"
                onClick={handleDownloadInstaller}
                disabled={!installerPortalUrl.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {t('stationPcs', 'generateInstallerDownload')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New-PC modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('stationPcs', 'newPC')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('stationPcs', 'newPCSubtitle')}</p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('stationPcs', 'fieldSerial')} *
                </label>
                <input
                  type="text"
                  value={formSerial}
                  onChange={(e) => setFormSerial(e.target.value)}
                  className="input-field font-mono"
                  placeholder="COBOTDSM-001"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">{t('stationPcs', 'fieldSerialHint')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('stationPcs', 'fieldMac')}
                  </label>
                  <input
                    type="text"
                    value={formMac}
                    onChange={(e) => setFormMac(e.target.value)}
                    className="input-field font-mono"
                    placeholder="b8:3d:fb:a7:20:21"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('stationPcs', 'fieldHostname')}
                  </label>
                  <input
                    type="text"
                    value={formHostname}
                    onChange={(e) => setFormHostname(e.target.value)}
                    className="input-field font-mono"
                    placeholder="shop-pc-01"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('stationPcs', 'fieldNickname')}
                </label>
                <input
                  type="text"
                  value={formNickname}
                  onChange={(e) => setFormNickname(e.target.value)}
                  className="input-field"
                  placeholder={t('stationPcs', 'fieldNicknamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('stationPcs', 'fieldNotes')}
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="input-field"
                  rows={2}
                />
              </div>
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn-secondary"
                >
                  {t('common', 'cancel')}
                </button>
                <button type="submit" disabled={formSubmitting} className="btn-primary disabled:opacity-50">
                  {formSubmitting ? t('common', 'saving') : t('common', 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Selected detail panel ----------------------------------------------------

function StationPCDetail({
  pc,
  stations,
  onAssign,
  onRetire,
  onApprove,
  onChange,
  t,
}: {
  pc: StationPC;
  stations: StationLite[];
  onAssign: (pc: StationPC, stationId: string | null) => void;
  onRetire: (pc: StationPC) => void;
  onApprove: (pc: StationPC) => void;
  onChange: (updated: StationPC) => void;
  t: TFn;
}) {
  const [editing, setEditing] = useState(false);
  const [mac, setMac] = useState(pc.macAddress || '');
  const [hostname, setHostname] = useState(pc.hostname || '');
  const [nickname, setNickname] = useState(pc.nickname || '');
  const [notes, setNotes] = useState(pc.notes || '');
  const [saving, setSaving] = useState(false);

  const style = STATUS_STYLES[displayStatus(pc)];

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/station-pcs/${pc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macAddress: mac,
          hostname,
          nickname,
          notes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onChange(data.stationPC);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  // Stations that are selectable for assignment: either this PC's current Station
  // or any Station with no StationPC assigned yet.
  const selectableStations = stations.filter(
    (s) => !s.stationPCId || s.stationPCId === pc.id || s.id === pc.station?.id
  );

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-mono font-semibold text-gray-900">{pc.serial}</div>
          {pc.nickname && <div className="text-sm text-gray-500">{pc.nickname}</div>}
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${style.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label(t)}
        </span>
      </div>

      {/* Quarantine banner — shown until an operator approves a self-registered PC */}
      {!pc.approved && (
        <div className="mb-5 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-200 text-yellow-800 text-xs font-bold">
                !
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-yellow-900">
                {t('stationPcs', 'quarantineTitle')}
              </div>
              <div className="text-xs text-yellow-800 mt-1">
                {t('stationPcs', 'quarantineBody')}
              </div>
              <button
                onClick={() => onApprove(pc)}
                className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium transition-colors"
              >
                {t('stationPcs', 'approve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment */}
      <div className="mb-5 pb-5 border-b border-gray-100">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          {t('stationPcs', 'assignedStation')}
        </label>
        <select
          value={pc.station?.id || ''}
          onChange={(e) => onAssign(pc, e.target.value || null)}
          className="input-field"
        >
          <option value="">{t('stationPcs', 'unassigned')}</option>
          {selectableStations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.stationNumber} — {s.title} ({s.clientName})
            </option>
          ))}
        </select>
        {pc.station && (
          <>
            <p className="text-xs text-gray-500 mt-1">
              {t('stationPcs', 'client')}: {pc.station.client.displayName}
            </p>
            <button
              type="button"
              onClick={() => onAssign(pc, null)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 text-xs font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 015.656 0M10.172 13.828a4 4 0 01-5.656 0m5.656 0l-5.656 5.657M13.828 10.172l5.657-5.657" />
              </svg>
              {t('stationPcs', 'unassignBackToApproval')}
            </button>
            <p className="text-xs text-gray-400 mt-1.5 italic">
              {t('stationPcs', 'unassignHint')}
            </p>
          </>
        )}
      </div>

      {/* Fields */}
      <dl className="space-y-3 text-sm">
        <DetailRow
          label={t('stationPcs', 'fieldMac')}
          value={
            editing ? (
              <input value={mac} onChange={(e) => setMac(e.target.value)} className="input-field font-mono text-xs" />
            ) : (
              <span className="font-mono">{pc.macAddress || <span className="text-gray-400">—</span>}</span>
            )
          }
        />
        <DetailRow
          label={t('stationPcs', 'fieldHostname')}
          value={
            editing ? (
              <input value={hostname} onChange={(e) => setHostname(e.target.value)} className="input-field font-mono text-xs" />
            ) : (
              <span className="font-mono">{pc.hostname || <span className="text-gray-400">—</span>}</span>
            )
          }
        />
        <DetailRow
          label={t('stationPcs', 'fieldNickname')}
          value={
            editing ? (
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="input-field text-xs" />
            ) : (
              pc.nickname || <span className="text-gray-400">—</span>
            )
          }
        />
        <DetailRow
          label={t('stationPcs', 'lastHeartbeat')}
          value={
            pc.lastHeartbeatAt
              ? `${new Date(pc.lastHeartbeatAt).toLocaleString()} ${pc.lastHeartbeatIp ? `· ${pc.lastHeartbeatIp}` : ''}`
              : <span className="text-gray-400">{t('stationPcs', 'never')}</span>
          }
        />
        <DetailRow
          label={t('stationPcs', 'softwareVersions')}
          value={
            <span className="text-xs">
              robot: <span className="font-mono">{pc.robotVersion || '—'}</span>
              {' · '}
              relfar: <span className="font-mono">{pc.relfarVersion || '—'}</span>
            </span>
          }
        />
        <DetailRow
          label={t('stationPcs', 'fieldNotes')}
          value={
            editing ? (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field text-xs" rows={2} />
            ) : (
              <span className="whitespace-pre-wrap">{pc.notes || <span className="text-gray-400">—</span>}</span>
            )
          }
        />
      </dl>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-gray-100">
        {editing ? (
          <>
            <button onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
              {saving ? t('common', 'saving') : t('common', 'save')}
            </button>
            <button
              onClick={() => {
                setMac(pc.macAddress || '');
                setHostname(pc.hostname || '');
                setNickname(pc.nickname || '');
                setNotes(pc.notes || '');
                setEditing(false);
              }}
              className="btn-secondary text-sm"
            >
              {t('common', 'cancel')}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="btn-secondary text-sm">
              {t('common', 'edit')}
            </button>
            {pc.status !== 'retired' && (
              <button
                onClick={() => onRetire(pc)}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                {t('stationPcs', 'retireButton')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}
