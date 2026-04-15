'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';
import StreetView from '@/components/StreetView';
import AddressAutocomplete from '@/components/AddressAutocomplete';

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
      <div className="bg-white rounded-xl shadow-xl p-5 max-w-xs w-full text-center">
        <p className="text-sm font-medium text-gray-800 mb-4">{label}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition">{t('common', 'no')}</button>
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

const HoldToSaveButton = ({ onSave }: { onSave: () => void }) => {
  const { t } = useLanguage();
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startRef = useRef(0);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const startHold = () => {
    setHolding(true);
    setSaved(false);
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / 2000, 1);
      setProgress(pct);
      if (pct >= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setHolding(false);
        setProgress(0);
        setSaved(true);
        onSaveRef.current();
        setTimeout(() => setSaved(false), 2000);
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
    <button
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      className={`px-3 py-1.5 ${saved ? 'bg-green-700' : 'bg-green-500'} text-white text-xs rounded-lg font-medium transition relative overflow-hidden whitespace-nowrap`}
    >
      <div className="absolute inset-0 bg-green-700 transition-none" style={{ width: `${progress * 100}%` }} />
      <span className="relative">{saved ? t('common', 'saved') : holding ? t('common', 'holding') : `${t('common', 'save')} (hold 2s)`}</span>
    </button>
  );
};

// Types matching API structure
interface Machine {
  id: string;
  serialNumber: string;
  type: 'robot' | 'laser';
  model: string;
  nickname?: string;
  ipAddress?: string;
  status: string;
  address?: string;
  city?: string;
  province?: string;
}

interface StationInvoice {
  id: string;
  qbInvoiceId: string;
  invoiceNumber: string;
  invoiceType: string;
  amount: number | null;
  linkedAt: string;
  machines: {
    id: string;
    serialNumber: string;
    type: string;
    model: string;
    status: string;
  }[];
}

interface Station {
  id: string;
  stationNumber: string;
  clientId: string;
  client: {
    displayName: string;
    companyName: string;
    email: string;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
  };
  title: string;
  notes?: string;
  status: 'not_configured' | 'waiting_pairing' | 'in_trouble' | 'active' | 'draft' | 'in_progress' | 'testing' | 'completed' | 'archived';
  // Optional deployment address. When all NULL the UI falls back to
  // the client's business address. `addressLocked` is a UI-only guard
  // that forces the user to tick "unlock" before editing.
  addressLine?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  addressLocked?: boolean;
  invoices: StationInvoice[];
  machines: Machine[];
  robotPrograms: {
    id: string;
    name: string;
    status: string;
    machineId?: string;
  }[];
  laserPresets: {
    id: string;
    name: string;
    status: string;
    machineId?: string;
  }[];
  stationPC?: {
    id: string;
    serial: string;
    macAddress?: string | null;
    hostname?: string | null;
    nickname?: string | null;
    status: string;
    lastHeartbeatAt?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Machine taxonomy (2026-04-15)
// ---------------------------------------------------------------------------
// Category → Subcategory → Model. Serial entry on a line-item card creates
// a real Machine row; the serial then becomes read-only (super-admin will
// later be the only one who can edit it). Robot memory (pathways, obstacles,
// self-awareness) lives on the Machine row and will eventually be copyable
// from one Machine to another via a "replace machine" action, so that a
// client swapping hardware doesn't lose their configuration.
// ---------------------------------------------------------------------------
type MachineCategory = 'robot' | 'accessory';
type MachineSubcategory = 'laser' | 'traditional_welding' | 'sanding' | null;

const ROBOT_MODELS = ['E03', 'E05', 'E10', 'E12', 'E12+Rail3M', 'E12+Rail4M'] as const;
const LASER_MODELS = ['Cleaning', 'Welding'] as const;
// Subcategory values are stable identifiers stored in the DB — labels
// are resolved through t() at render time so the UI honours the active
// language. See laserModelLabel() below for the mirror-image treatment
// of Cleaning/Welding.
const ACCESSORY_SUBCATEGORY_VALUES: Exclude<MachineSubcategory, null>[] = [
  'laser',
  'traditional_welding',
  'sanding',
];

/**
 * Infer category/subcategory/model from an invoice line item's model field
 * (purple chip shown on the card) and/or its description. Best-effort only —
 * user can override via the dropdowns. Nothing is auto-saved; defaults only
 * populate the dropdowns on first render.
 */
function inferTaxonomyFromItem(item: { description?: string; model?: string }):
  { category: MachineCategory; subcategory: MachineSubcategory; model: string } {
  const hay = `${item.model || ''} ${item.description || ''}`.toUpperCase();
  // Robot model match — check longest-first so "E12+Rail4M" wins over "E12".
  const robotMatch = [...ROBOT_MODELS]
    .sort((a, b) => b.length - a.length)
    .find((m) => hay.includes(m.toUpperCase()));
  if (robotMatch) return { category: 'robot', subcategory: null, model: robotMatch };
  if (hay.includes('CLEANING')) return { category: 'accessory', subcategory: 'laser', model: 'Cleaning' };
  if (hay.includes('WELDING LASER') || hay.includes('LASER WELDING'))
    return { category: 'accessory', subcategory: 'laser', model: 'Welding' };
  if (hay.includes('LASER'))     return { category: 'accessory', subcategory: 'laser', model: '' };
  if (hay.includes('SANDING'))   return { category: 'accessory', subcategory: 'sanding', model: '' };
  if (hay.includes('WELDING'))   return { category: 'accessory', subcategory: 'traditional_welding', model: '' };
  // Default fallback — robot with no specific model.
  return { category: 'robot', subcategory: null, model: '' };
}

/**
 * Legacy machineData shape pre-taxonomy migration: `machineType: 'cobot' | 'laser'`.
 * We normalise it into the new shape on read so older stations don't show
 * blank dropdowns.
 */
type MachineDataEntry = {
  machineId?: string;              // set once the Machine DB row exists
  serialNumber?: string;
  category?: MachineCategory;
  subcategory?: MachineSubcategory;
  model?: string;
  // legacy (pre-2026-04-15):
  machineType?: 'cobot' | 'laser';
};

function migrateLegacyEntry(md: MachineDataEntry | undefined): MachineDataEntry {
  if (!md) return {};
  if (md.category) return md; // already new-shape
  if (md.machineType === 'cobot') return { ...md, category: 'robot', subcategory: null };
  if (md.machineType === 'laser') return { ...md, category: 'accessory', subcategory: 'laser' };
  return md;
}

// Extracted Machine Items component with proper state management
const MachineItems = ({ editingStation, setEditingStation, handleUpdateStation }: {
  editingStation: Station;
  setEditingStation: (station: Station) => void;
  handleUpdateStation: (updates: Partial<Station>) => Promise<void>;
}) => {
  const { t } = useLanguage();
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(editingStation.notes || '{}'); } catch { /* not JSON */ }
  const items: { description: string; quantity: number; model?: string; sourceInvoiceNumber?: string; sourceInvoiceId?: string }[] =
    (meta.items as { description: string; quantity: number; model?: string; sourceInvoiceNumber?: string; sourceInvoiceId?: string }[]) || [];
  const rawMachineData: MachineDataEntry[] = (meta.machineData as MachineDataEntry[]) || [];
  const machineData: MachineDataEntry[] = items.map((_, i) => migrateLegacyEntry(rawMachineData[i]));

  // Local state for serial number inputs (before hold-to-save)
  const [serialInputs, setSerialInputs] = useState<Record<number, string>>({});
  // Per-row "creating / error" state so the UI can indicate POST-in-flight
  // and surface duplicate-serial errors from the backend.
  const [rowError, setRowError] = useState<Record<number, string | null>>({});
  const [rowSaving, setRowSaving] = useState<Record<number, boolean>>({});

  // Initialize serial inputs from saved data
  useEffect(() => {
    const initial: Record<number, string> = {};
    items.forEach((_, i) => {
      const md = machineData[i];
      if (md?.serialNumber) initial[i] = md.serialNumber;
    });
    setSerialInputs(initial);
    setRowError({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingStation.id]);

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{t('stations', 'noMachines')}</p>;
  }

  /**
   * Persist a single field (category, subcategory, or model) into
   * notes.machineData[i] and PATCH the station. Does NOT create a Machine
   * DB row — that only happens when the serial is saved.
   */
  const saveTaxonomyField = (
    index: number,
    patch: Partial<Pick<MachineDataEntry, 'category' | 'subcategory' | 'model'>>
  ) => {
    const freshMeta = { ...meta };
    if (!freshMeta.machineData) freshMeta.machineData = [];
    const md = freshMeta.machineData as MachineDataEntry[];
    while (md.length <= index) md.push({});
    md[index] = { ...migrateLegacyEntry(md[index]), ...patch };
    // When category flips to robot, subcategory must be null.
    if (md[index].category === 'robot') md[index].subcategory = null;
    const newNotes = JSON.stringify(freshMeta);
    setEditingStation({ ...editingStation, notes: newNotes });
    handleUpdateStation({ notes: newNotes });
  };

  /**
   * Hold-to-save handler for the serial input. Persists the serial into
   * notes.machineData[i] AND POSTs to /api/machines to create a real
   * Machine DB row. The returned machine.id is stored back into
   * notes.machineData[i].machineId so the card can lock itself.
   */
  const saveSerial = async (index: number) => {
    const serial = (serialInputs[index] || '').trim();
    if (!serial) return;
    const item = items[index];
    const existing = machineData[index] || {};
    const inferred = inferTaxonomyFromItem(item);
    const category = (existing.category || inferred.category) as MachineCategory;
    const subcategory = category === 'robot'
      ? null
      : (existing.subcategory || inferred.subcategory || null);
    const model = (existing.model || inferred.model || '').trim();

    if (!model) {
      setRowError(prev => ({ ...prev, [index]: t('stations', 'modelRequiredBeforeSerial') || 'Pick a model before saving the serial.' }));
      return;
    }
    if (category === 'accessory' && !subcategory) {
      setRowError(prev => ({ ...prev, [index]: t('stations', 'subcategoryRequired') || 'Pick a subcategory for accessories before saving.' }));
      return;
    }

    // Look up the StationInvoice.id for this line item so the new Machine
    // is anchored to the invoice it was sold on.
    const invoiceNumber = item.sourceInvoiceNumber;
    const matchedInvoice = invoiceNumber
      ? editingStation.invoices.find((inv) => inv.invoiceNumber === invoiceNumber)
      : undefined;

    setRowSaving(prev => ({ ...prev, [index]: true }));
    setRowError(prev => ({ ...prev, [index]: null }));

    try {
      // If this row already has a machineId, skip creation — the serial is
      // locked. Re-saving is a super-admin-only path that we'll wire up
      // later (a dedicated "Replace machine" flow that copies the robot
      // memory blob over). For now the serial input is disabled when
      // machineId exists, so this branch should be unreachable.
      if (!existing.machineId) {
        const res = await fetch('/api/machines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serialNumber: serial,
            category,
            subcategory,
            model,
            managedClientId: editingStation.clientId,
            invoiceId: matchedInvoice?.id,
            // Ensure the machine is linked to *this* Station via the
            // StationMachine join row at creation time. Without this, the
            // Machines list has no station/PC context and the
            // "Open software" button can't render.
            stationId: editingStation.id,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'create failed');
        }
        const createdId: string | undefined = data?.machine?.id;

        // Persist machineId + serial + taxonomy snapshot into notes.
        const freshMeta = { ...meta };
        if (!freshMeta.machineData) freshMeta.machineData = [];
        const md = freshMeta.machineData as MachineDataEntry[];
        while (md.length <= index) md.push({});
        md[index] = {
          ...migrateLegacyEntry(md[index]),
          machineId: createdId,
          serialNumber: serial,
          category,
          subcategory,
          model,
        };

        // Auto-flip status to waiting_pairing when every row has a serial.
        const allSerialled = items.every((_, i) => {
          const e = md[i];
          return e && typeof e.serialNumber === 'string' && e.serialNumber.trim() !== '';
        });
        const newNotes = JSON.stringify(freshMeta);
        setEditingStation({ ...editingStation, notes: newNotes });
        if (allSerialled && editingStation.status === 'not_configured') {
          await handleUpdateStation({ notes: newNotes, status: 'waiting_pairing' as Station['status'] });
        } else {
          await handleUpdateStation({ notes: newNotes });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create machine';
      setRowError(prev => ({ ...prev, [index]: msg }));
    } finally {
      setRowSaving(prev => ({ ...prev, [index]: false }));
    }
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const md = machineData[i] || {};
        const inferred = inferTaxonomyFromItem(item);
        const category: MachineCategory = (md.category || inferred.category) as MachineCategory;
        const subcategory: MachineSubcategory = category === 'robot'
          ? null
          : (md.subcategory || inferred.subcategory || null);
        const model: string = md.model || inferred.model || '';
        const locked = !!md.machineId;           // serial + taxonomy frozen once Machine exists
        const modelOptions: readonly string[] =
          category === 'robot' ? ROBOT_MODELS :
          category === 'accessory' && subcategory === 'laser' ? LASER_MODELS :
          [];

        return (
          <div key={i} className="p-4 border border-gray-200 rounded-lg">
            {/* Header row with icon + invoice line description */}
            <div className="flex items-start gap-3 mb-3">
              {category === 'accessory' ? (
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              ) : (
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-4">
                  {item.model && (
                    <div className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wide whitespace-nowrap">{String(item.model)}</div>
                  )}
                  <div className="text-sm font-medium text-gray-900 pt-0.5">{String(item.description || '')}</div>
                </div>
                {!!(item.sourceInvoiceNumber || meta.invoiceNumber) && (
                  <div className="mt-1 text-xs text-gray-400">Invoice #{String(item.sourceInvoiceNumber || meta.invoiceNumber || '')}</div>
                )}
              </div>
              {locked && (
                <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 rounded-full px-2 py-0.5 flex-shrink-0" title={t('stations', 'machineCreatedLockHint') || 'Machine created — serial and taxonomy are locked. A super-admin will be needed to replace the serial.'}>
                  {t('stations', 'machineCreatedLabel') || 'Machine created'}
                </span>
              )}
            </div>

            {/* Category */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('stations', 'category') || 'Category'}</label>
                <select
                  value={category}
                  disabled={locked}
                  onChange={(e) => {
                    const next = e.target.value as MachineCategory;
                    // Changing category usually invalidates model — clear it.
                    saveTaxonomyField(i, { category: next, model: '' , subcategory: next === 'robot' ? null : null });
                  }}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="robot">{t('stations', 'categoryRobot') || 'Robot'}</option>
                  <option value="accessory">{t('stations', 'categoryAccessory') || 'Accessory'}</option>
                </select>
              </div>

              {/* Subcategory — only for Accessory */}
              {category === 'accessory' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('stations', 'subcategory') || 'Subcategory'}</label>
                  <select
                    value={subcategory || ''}
                    disabled={locked}
                    onChange={(e) => {
                      const next = (e.target.value || null) as MachineSubcategory;
                      saveTaxonomyField(i, { subcategory: next, model: '' });
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">{t('stations', 'selectSubcategory') || 'Select…'}</option>
                    {ACCESSORY_SUBCATEGORY_VALUES.map((v) => {
                      const labelKey =
                        v === 'laser' ? 'subcategoryLaser'
                        : v === 'traditional_welding' ? 'subcategoryTraditionalWelding'
                        : 'subcategorySanding';
                      return (
                        <option key={v} value={v}>{t('stations', labelKey)}</option>
                      );
                    })}
                  </select>
                </div>
              ) : <div />}

              {/* Model */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('stations', 'modelLabel') || 'Model'}</label>
                {modelOptions.length > 0 ? (
                  <select
                    value={model}
                    disabled={locked}
                    onChange={(e) => saveTaxonomyField(i, { model: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">{t('stations', 'selectModel') || 'Select model…'}</option>
                    {modelOptions.map((m) => {
                      // Robot model SKUs (E03, E05, …) are product codes —
                      // show the raw value. Laser models are user-facing
                      // words (Cleaning/Welding) — translate them.
                      const label =
                        m === 'Cleaning' ? t('stations', 'laserModelCleaning')
                        : m === 'Welding' ? t('stations', 'laserModelWelding')
                        : m;
                      return (
                        <option key={m} value={m}>{label}</option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={model}
                    disabled={locked}
                    onChange={(e) => saveTaxonomyField(i, { model: e.target.value })}
                    placeholder={t('stations', 'modelPlaceholder') || 'Model'}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                  />
                )}
              </div>
            </div>

            {/* Serial Number with Hold-to-Save — locked once Machine row exists */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('stations', 'serialNumber')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={serialInputs[i] || ''}
                  disabled={locked || rowSaving[i]}
                  onChange={(e) => setSerialInputs(prev => ({ ...prev, [i]: e.target.value }))}
                  placeholder={t('stations', 'enterSerial')}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                />
                {!locked && (
                  <HoldToSaveButton onSave={() => { saveSerial(i); }} />
                )}
              </div>
              {locked && md.serialNumber && (
                <div className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {md.serialNumber}
                  <span className="ml-2 text-gray-400">·</span>
                  <span className="text-gray-500">{t('stations', 'serialLockedHint') || 'Serial locked — super-admin only'}</span>
                </div>
              )}
              {!locked && md.serialNumber && (
                <div className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {t('common', 'save')}: {md.serialNumber}
                </div>
              )}
              {rowError[i] && (
                <div className="mt-1 text-xs text-red-600">{rowError[i]}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface ManagedClient {
  id: string;
  qbClient: {
    id: string;
    displayName: string;
  };
}

interface QBInvoiceItem {
  description: string;
  model?: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface QBInvoice {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  amount: number | null;
  items?: QBInvoiceItem[];
  clientId?: string;
  clientName?: string;
}

// Line-item selection row used by the station-creation picker (8.4C)
interface SelectedLineItem {
  lineIndex: number;
  description: string;
  quantity: number;
  amount: number;
  model?: string;
}

export default function AdminStationsPage() {
  const { t } = useLanguage();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ManagedClient[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [qbInvoices, setQBInvoices] = useState<QBInvoice[]>([]);

  // Modal states
  const [showNewStationModal, setShowNewStationModal] = useState(false);
  const [showAddMachineModal, setShowAddMachineModal] = useState(false);
  const [showLinkInvoiceModal, setShowLinkInvoiceModal] = useState(false);

  // Form states
  const [newStationForm, setNewStationForm] = useState({
    clientId: '',
    title: '',
    notes: '',
  });

  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // 8.4C — line-item picker state (drives the 2-stage Link Invoice modal)
  const [pickerInvoiceId, setPickerInvoiceId] = useState<string | null>(null);
  // key = lineIndex, value = quantity to assign (0 means not selected)
  const [pickerSelections, setPickerSelections] = useState<Record<number, number>>({});

  // Fetch stations
  const fetchStations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/stations');
      if (!res.ok) throw new Error('Failed to fetch stations');
      const data = await res.json();
      setStations(data.stations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch clients
  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/managed-clients');
      if (!res.ok) throw new Error('Failed to fetch clients');
      const data = await res.json();
      setClients(data.clients || []);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  }, []);

  // Fetch QB invoices
  const fetchQBInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/quickbooks/invoices');
      if (!res.ok) throw new Error('Failed to fetch invoices');
      const data = await res.json();
      setQBInvoices(data.invoices || []);
    } catch (err) {
      console.error('Failed to fetch QB invoices:', err);
    }
  }, []);

  // Fetch machines for selected job's client
  const fetchMachinesForClient = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/machines?clientId=${clientId}`);
      if (!res.ok) throw new Error('Failed to fetch machines');
      const data = await res.json();
      setMachines(data.machines || []);
    } catch (err) {
      console.error('Failed to fetch machines:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStations();
    fetchClients();
    fetchQBInvoices();
  }, [fetchStations, fetchClients, fetchQBInvoices]);

  // Deep-link support: when navigated here from the clients tab with
  // ?stationId=<id>, auto-select that station once the list has loaded.
  // We read the query param off window.location instead of
  // useSearchParams() to avoid the Suspense boundary that Next 14 now
  // requires around that hook.
  const deepLinkAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (stations.length === 0) return;
    const id = new URLSearchParams(window.location.search).get('stationId');
    if (!id) return;
    if (deepLinkAppliedRef.current === id) return;
    if (stations.some((s) => s.id === id)) {
      deepLinkAppliedRef.current = id;
      setSelectedStationId(id);
    }
  }, [stations]);

  // Load machines when station is selected
  useEffect(() => {
    if (selectedStationId) {
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        setEditingStation(station);
        fetchMachinesForClient(station.clientId);
      }
    }
  }, [selectedStationId, stations, fetchMachinesForClient]);

  // Create new station
  const handleCreateStation = async () => {
    try {
      if (!newStationForm.clientId || !newStationForm.title.trim()) {
        setError(t('stations', 'clientRequired'));
        return;
      }

      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managedClientId: newStationForm.clientId,
          title: newStationForm.title,
          notes: newStationForm.notes,
        }),
      });

      if (!res.ok) throw new Error('Failed to create station');
      const data = await res.json();

      setStations([...stations, data.station]);
      setShowNewStationModal(false);
      setNewStationForm({ clientId: '', title: '', notes: '' });
      setSelectedStationId(data.station.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create station');
    }
  };

  // Update station
  const handleUpdateStation = async (updates: Partial<Station>) => {
    if (!selectedStationId) return;

    try {
      const res = await fetch(`/api/stations/${selectedStationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update station');
      const data = await res.json();

      setStations(stations.map((s) => (s.id === selectedStationId ? data.station : s)));
      setEditingStation(data.station);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update station');
    }
  };

  // Add machine to station
  const handleAddMachine = async (machineId: string) => {
    if (!selectedStationId) return;

    try {
      const res = await fetch(`/api/stations/${selectedStationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addMachineId: machineId }),
      });

      if (!res.ok) throw new Error('Failed to add machine');
      const data = await res.json();

      setStations(stations.map((s) => (s.id === selectedStationId ? data.station : s)));
      setEditingStation(data.station);
      setShowAddMachineModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add machine');
    }
  };

  // Remove machine from station
  const handleRemoveMachine = async (machineId: string) => {
    if (!selectedStationId) return;

    try {
      const res = await fetch(`/api/stations/${selectedStationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeMachineId: machineId }),
      });

      if (!res.ok) throw new Error('Failed to remove machine');
      const data = await res.json();

      setStations(stations.map((s) => (s.id === selectedStationId ? data.station : s)));
      setEditingStation(data.station);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove machine');
    }
  };

  // Link an entire invoice (legacy/full) or selected line items (8.4C) to the
  // currently selected station.
  const handleLinkInvoice = async (
    invoiceId: string,
    lineItems?: SelectedLineItem[]
  ) => {
    if (!selectedStationId) return;
    const inv = qbInvoices.find((i) => i.id === invoiceId);
    if (!inv) {
      setError('Invoice not found');
      return;
    }

    try {
      const body: Record<string, unknown> = {
        qbInvoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType,
        amount: inv.amount,
      };
      if (lineItems && lineItems.length > 0) body.lineItems = lineItems;

      const res = await fetch(`/api/stations/${selectedStationId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to link invoice');
      const data = await res.json();

      setStations(stations.map((s) => (s.id === selectedStationId ? data.station : s)));
      setEditingStation(data.station);
      setShowLinkInvoiceModal(false);
      setPickerInvoiceId(null);
      setPickerSelections({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link invoice');
    }
  };

  // Open the line-item picker for a given QB invoice; pre-select all items
  // at full quantity (user can tick them off).
  const openLineItemPicker = (invoiceId: string) => {
    const inv = qbInvoices.find((i) => i.id === invoiceId);
    const seed: Record<number, number> = {};
    (inv?.items || []).forEach((it, idx) => {
      seed[idx] = it.quantity;
    });
    setPickerSelections(seed);
    setPickerInvoiceId(invoiceId);
  };

  // Submit the picker — turn selections into the lineItems payload.
  const submitLineItemPicker = () => {
    if (!pickerInvoiceId) return;
    const inv = qbInvoices.find((i) => i.id === pickerInvoiceId);
    if (!inv) return;

    const selected: SelectedLineItem[] = (inv.items || [])
      .map((it, idx) => ({ it, idx, qty: pickerSelections[idx] ?? 0 }))
      .filter((row) => row.qty > 0)
      .map(({ it, idx, qty }) => ({
        lineIndex: idx,
        description: it.description,
        quantity: qty,
        // Prorate amount if user reduced quantity below the invoice quantity.
        amount:
          it.quantity > 0 ? (it.amount * qty) / it.quantity : it.amount,
        model: it.model || undefined,
      }));

    if (selected.length === 0) {
      setError('Select at least one line item');
      return;
    }

    handleLinkInvoice(pickerInvoiceId, selected);
  };

  // Unlink invoice from station
  const handleUnlinkInvoice = async (invoiceId: string) => {
    if (!selectedStationId) return;

    try {
      const res = await fetch(
        `/api/stations/${selectedStationId}/invoices/${invoiceId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to unlink invoice');
      const data = await res.json();

      setStations(stations.map((s) => (s.id === selectedStationId ? data.station : s)));
      setEditingStation(data.station);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink invoice');
    }
  };

  // Delete station
  const handleDeleteStation = async () => {
    if (!selectedStationId) return;

    try {
      const res = await fetch(`/api/stations/${selectedStationId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete station');

      setStations(stations.filter((s) => s.id !== selectedStationId));
      setSelectedStationId(null);
      setEditingStation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete station');
    }
  };

  // Helper to count machines from notes JSON (invoice items + machineData).
  // Handles both the new taxonomy (category + subcategory) and the legacy
  // machineType = 'cobot'|'laser' rows so older stations keep rendering.
  const getMachineCount = (station: Station) => {
    try {
      const meta = JSON.parse(station.notes || '{}');
      const items = meta.items || [];
      const machineData: MachineDataEntry[] = (meta.machineData || []) as MachineDataEntry[];

      if (items.length === 0) return t('stations', 'noMachines');

      const normalized = machineData.map((md) => migrateLegacyEntry(md));
      const robots = normalized.filter(md => md?.category === 'robot').length;
      const accessories = normalized.filter(md => md?.category === 'accessory').length;
      const untyped = items.length - robots - accessories;

      const parts: string[] = [];
      if (robots > 0) parts.push(`${robots} ${t('stations', 'categoryRobot') || 'Robot'}${robots !== 1 ? 's' : ''}`);
      if (accessories > 0) parts.push(`${accessories} ${t('stations', 'categoryAccessory') || 'Accessory'}${accessories !== 1 ? 's' : ''}`);
      if (untyped > 0) parts.push(`${untyped} unassigned`);

      // Show serial numbers if any
      const serials = normalized.filter(md => md?.serialNumber).length;
      if (serials > 0) {
        return `${parts.join(', ')} (${serials}/${items.length} serial#)`;
      }

      return parts.length > 0 ? parts.join(', ') : `${items.length} machine${items.length !== 1 ? 's' : ''}`;
    } catch {
      return t('stations', 'noMachines');
    }
  };

  // Get available machines (not yet in station)
  const getAvailableMachines = () => {
    if (!editingStation) return [];
    const assignedIds = new Set(editingStation.machines.map((m) => m.id));
    return machines.filter((m) => !assignedIds.has(m.id));
  };

  // Get available invoices for the current station's client (not yet linked).
  // Filter to the station's client by matching the station's ManagedClient.qbClient.id
  // against the QB invoice's clientId (QB CustomerRef.value).
  const getAvailableInvoices = () => {
    if (!editingStation) return [];
    const linkedIds = new Set(editingStation.invoices.map((inv) => inv.qbInvoiceId));
    const managed = clients.find((c) => c.id === editingStation.clientId);
    const qbCustomerId = managed?.qbClient?.id;
    return qbInvoices.filter((inv) => {
      if (linkedIds.has(inv.id)) return false;
      // If invoice has no clientId we cannot confirm, fall back to including it.
      if (qbCustomerId && inv.clientId && inv.clientId !== qbCustomerId) return false;
      return true;
    });
  };

  // Filter stations by business name search
  const filteredStations = searchFilter.trim()
    ? stations.filter((s) =>
        s.client.displayName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        s.client.companyName.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : stations;

  const selectedStation = stations.find((s) => s.id === selectedStationId);

  return (
    <div>
      <PageHeader title={t('stations', 'title')} />

      {/* Error banner */}
      {error && (
        <div className="fixed top-4 left-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 z-50">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className="flex h-[calc(100vh-12rem)] bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
      {/* Left Panel: Station List */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        {/* Search */}
        <div className="border-b border-gray-200 p-4">
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              placeholder={t('stations', 'searchStations')}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Stations List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </div>
          ) : filteredStations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p className="text-sm">{searchFilter ? t('stations', 'noStationsMatch') : t('stations', 'noStationsYet')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredStations.map((station) => (
                <button
                  key={station.id}
                  onClick={() => setSelectedStationId(station.id)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition border-l-4 ${
                    selectedStationId === station.id
                      ? 'border-l-blue-600 bg-blue-50'
                      : 'border-l-transparent'
                  }`}
                >
                  <div className="font-semibold text-gray-900 text-sm truncate">
                    {station.title}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {station.client.displayName}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {getMachineCount(station)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        station.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : station.status === 'archived'
                            ? 'bg-gray-100 text-gray-800'
                            : station.status === 'testing'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {station.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Station Details */}
      <div className="flex-1 overflow-y-auto">
        {selectedStation && editingStation ? (
          <div className="p-6 max-w-4xl">
            {/* Station Info Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{t('stations', 'stationInfo')}</h2>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('stations', 'stationNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={editingStation.title}
                    onChange={(e) => {
                      const updated = { ...editingStation, title: e.target.value };
                      setEditingStation(updated);
                    }}
                    onBlur={() =>
                      handleUpdateStation({ title: editingStation.title })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('stations', 'statusLabel')}
                  </label>
                  <select
                    value={editingStation.status}
                    onChange={(e) => {
                      const updated = {
                        ...editingStation,
                        status: e.target.value as Station['status'],
                      };
                      setEditingStation(updated);
                      handleUpdateStation({
                        status: e.target.value as Station['status'],
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="not_configured">{t('stations', 'notConfigured')}</option>
                    <option value="waiting_pairing">{t('stations', 'waitingPairing')}</option>
                    <option value="in_trouble">{t('stations', 'inTrouble')}</option>
                    <option value="active">{t('stations', 'active')}</option>
                  </select>
                </div>

                {/* Client */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('stations', 'clientLabel')}
                  </label>
                  <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                    {editingStation.client.displayName}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('stations', 'descriptionLabel')}
                  </label>
                  <textarea
                    value={(() => { try { const m = JSON.parse(editingStation.notes || '{}'); return m.description || ''; } catch { return editingStation.notes || ''; } })()}
                    onChange={(e) => {
                      let meta: Record<string, unknown> = {};
                      try { meta = JSON.parse(editingStation.notes || '{}'); } catch { /* not JSON */ }
                      meta.description = e.target.value;
                      const updated = { ...editingStation, notes: JSON.stringify(meta) };
                      setEditingStation(updated);
                    }}
                    onBlur={() =>
                      handleUpdateStation({ notes: editingStation.notes })
                    }
                    placeholder={`${t('stations', 'descriptionLabel')}...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                </div>

                {/* Linked Invoice(s) Info */}
                {(() => {
                  try {
                    const meta = JSON.parse(editingStation.notes || '{}');
                    const invoices: { id: string; number: string }[] = meta.invoices || [];
                    // Fallback: if no invoices array but has invoiceNumber
                    if (invoices.length === 0 && meta.invoiceNumber) {
                      invoices.push({ id: meta.invoiceId, number: meta.invoiceNumber });
                    }
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-gray-700">
                            {invoices.length > 1 ? t('stations', 'linkedInvoices') : t('stations', 'linkInvoice')}
                          </label>
                          <button
                            onClick={() => {
                              setPickerInvoiceId(null);
                              setPickerSelections({});
                              setShowLinkInvoiceModal(true);
                            }}
                            className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition whitespace-nowrap"
                          >
                            + {t('stations', 'linkInvoice')}
                          </button>
                        </div>
                        {invoices.length > 0 ? (
                          <div className="space-y-1">
                            {invoices.map((inv, idx) => (
                              <div key={idx} className="text-sm bg-blue-50 rounded-lg px-3 py-2 text-blue-700 font-medium">
                                Invoice #{inv.number}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            {t('stations', 'noInvoicesAvailable')}
                          </p>
                        )}
                      </div>
                    );
                  } catch { /* not JSON */ }
                  return null;
                })()}
              </div>
            </div>

            {/* Station Address Section */}
            {(() => {
              const businessAddress = editingStation.client.address || '';
              const businessCity = editingStation.client.city || '';
              const businessProvince = editingStation.client.province || '';
              const businessPostal = editingStation.client.postalCode || '';

              // A station is "custom" the moment it has any non-null address
              // column. An all-null row means "use business address".
              const hasCustom = !!(
                editingStation.addressLine ||
                editingStation.city ||
                editingStation.province ||
                editingStation.postalCode ||
                editingStation.country
              );
              const mode: 'business' | 'custom' = hasCustom ? 'custom' : 'business';
              const locked = !!editingStation.addressLocked;

              // Pick which address feeds Street View + the mini map.
              const effective = hasCustom
                ? {
                    address: editingStation.addressLine || '',
                    city: editingStation.city || '',
                    province: editingStation.province || '',
                    postalCode: editingStation.postalCode || '',
                  }
                : {
                    address: businessAddress,
                    city: businessCity,
                    province: businessProvince,
                    postalCode: businessPostal,
                  };

              const fullAddress = [
                effective.address,
                effective.city,
                effective.province,
                effective.postalCode,
              ]
                .filter(Boolean)
                .join(', ');

              const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
              const mapSrc = fullAddress
                ? mapsApiKey
                  ? `https://www.google.com/maps/embed/v1/place?key=${mapsApiKey}&q=${encodeURIComponent(fullAddress)}&zoom=16`
                  : `https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}&z=16&output=embed`
                : '';

              const switchToBusiness = () => {
                // Clear the custom columns so the fallback kicks in.
                const updated = {
                  ...editingStation,
                  addressLine: null,
                  city: null,
                  province: null,
                  postalCode: null,
                  country: null,
                };
                setEditingStation(updated);
                handleUpdateStation({
                  addressLine: null,
                  city: null,
                  province: null,
                  postalCode: null,
                  country: null,
                });
              };
              const switchToCustom = () => {
                // Seed the custom fields with whatever the business
                // address currently has so the operator only edits the
                // bits that actually differ.
                const updated = {
                  ...editingStation,
                  addressLine: businessAddress || '',
                  city: businessCity || '',
                  province: businessProvince || '',
                  postalCode: businessPostal || '',
                  country: editingStation.country || '',
                };
                setEditingStation(updated);
                handleUpdateStation({
                  addressLine: updated.addressLine,
                  city: updated.city,
                  province: updated.province,
                  postalCode: updated.postalCode,
                  country: updated.country,
                });
              };

              const disabled = locked;

              return (
                <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">
                      {t('stations', 'addressSection') || 'Station address'}
                    </h2>
                    {/* Lock guardrail — must be unchecked to edit. */}
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={locked}
                        onChange={(e) => {
                          const next = e.target.checked;
                          const updated = { ...editingStation, addressLocked: next };
                          setEditingStation(updated);
                          handleUpdateStation({ addressLocked: next });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      {locked
                        ? t('stations', 'addressLocked') || 'Locked — uncheck to edit'
                        : t('stations', 'addressLockToProtect') || 'Lock to protect'}
                    </label>
                  </div>

                  {/* Mode radios */}
                  <div className="flex gap-4 mb-4">
                    <label
                      className={`flex items-start gap-2 cursor-pointer flex-1 p-3 rounded-lg border ${
                        mode === 'business' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="radio"
                        name="address-mode"
                        checked={mode === 'business'}
                        disabled={disabled}
                        onChange={() => { if (!disabled) switchToBusiness(); }}
                        className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {t('stations', 'addressUseBusiness') || 'Use business address (QuickBooks)'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {businessAddress
                            ? [businessAddress, businessCity, businessProvince, businessPostal].filter(Boolean).join(', ')
                            : t('stations', 'addressNoBusiness') || 'No address on file for this client'}
                        </div>
                      </div>
                    </label>
                    <label
                      className={`flex items-start gap-2 cursor-pointer flex-1 p-3 rounded-lg border ${
                        mode === 'custom' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="radio"
                        name="address-mode"
                        checked={mode === 'custom'}
                        disabled={disabled}
                        onChange={() => { if (!disabled) switchToCustom(); }}
                        className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {t('stations', 'addressUseCustom') || 'Custom install address'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {t('stations', 'addressUseCustomHint') ||
                            'Use a different address than the business one.'}
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Custom fields — only interactable in custom mode + unlocked */}
                  {mode === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {t('stations', 'addressLine') || 'Street address'}
                        </label>
                        <AddressAutocomplete
                          value={editingStation.addressLine || ''}
                          disabled={disabled}
                          onChange={(next) => setEditingStation({ ...editingStation, addressLine: next })}
                          onBlur={() => handleUpdateStation({ addressLine: editingStation.addressLine || null })}
                          onPlaceSelected={(parsed) => {
                            // Google picked a specific address — drop every
                            // related field at once so the operator sees the
                            // whole form snap to the real place. We preserve
                            // fields the parser couldn't fill (e.g. rural
                            // addresses with no locality) instead of wiping
                            // what the user already typed.
                            const updated = {
                              ...editingStation,
                              addressLine: parsed.addressLine || editingStation.addressLine,
                              city: parsed.city || editingStation.city,
                              province: parsed.province || editingStation.province,
                              postalCode: parsed.postalCode || editingStation.postalCode,
                              country: parsed.country || editingStation.country,
                            };
                            setEditingStation(updated);
                            handleUpdateStation({
                              addressLine: updated.addressLine,
                              city: updated.city,
                              province: updated.province,
                              postalCode: updated.postalCode,
                              country: updated.country,
                            });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">
                          {t('stations', 'addressAutocompleteHint') ||
                            'Start typing — pick a suggestion to auto-fill city, province and postal code.'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {t('stations', 'addressCity') || 'City'}
                        </label>
                        <input
                          type="text"
                          disabled={disabled}
                          value={editingStation.city || ''}
                          onChange={(e) => setEditingStation({ ...editingStation, city: e.target.value })}
                          onBlur={() => handleUpdateStation({ city: editingStation.city || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {t('stations', 'addressProvince') || 'Province / State'}
                        </label>
                        <input
                          type="text"
                          disabled={disabled}
                          value={editingStation.province || ''}
                          onChange={(e) => setEditingStation({ ...editingStation, province: e.target.value })}
                          onBlur={() => handleUpdateStation({ province: editingStation.province || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {t('stations', 'addressPostal') || 'Postal / ZIP code'}
                        </label>
                        <input
                          type="text"
                          disabled={disabled}
                          value={editingStation.postalCode || ''}
                          onChange={(e) => setEditingStation({ ...editingStation, postalCode: e.target.value })}
                          onBlur={() => handleUpdateStation({ postalCode: editingStation.postalCode || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {t('stations', 'addressCountry') || 'Country'}
                        </label>
                        <input
                          type="text"
                          disabled={disabled}
                          value={editingStation.country || ''}
                          onChange={(e) => setEditingStation({ ...editingStation, country: e.target.value })}
                          onBlur={() => handleUpdateStation({ country: editingStation.country || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Street View + mini map preview. Both render against
                      whichever address is currently effective. */}
                  {fullAddress ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">
                          {t('stations', 'addressStreetView') || 'Street view'}
                        </div>
                        <StreetView
                          address={effective.address}
                          city={effective.city}
                          province={effective.province}
                          postalCode={effective.postalCode}
                          className="h-48"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">
                          {t('stations', 'addressMap') || 'Map'}
                        </div>
                        <div className="h-48 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                          {mapSrc ? (
                            <iframe
                              src={mapSrc}
                              className="w-full h-full"
                              style={{ border: 0 }}
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                              allowFullScreen
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-xs text-gray-400 p-4 text-center">
                              {t('stations', 'addressMapUnavailable') || 'Map not available'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 italic">
                      {t('stations', 'addressEmpty') ||
                        'No address to preview yet. Pick a mode and fill in the fields above.'}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Station PC Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">{t('stations', 'stationPCSection')}</h2>
                <a
                  href="/admin/station-pcs"
                  title={t('stations', 'stationPCOpenList')}
                  className="text-xs px-3 py-1 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition whitespace-nowrap"
                >
                  {t('stations', 'stationPCManage')}
                </a>
              </div>

              {editingStation.stationPC ? (
                <div className="flex items-center justify-between gap-4 p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {editingStation.stationPC.nickname || editingStation.stationPC.hostname || editingStation.stationPC.serial}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      SN {editingStation.stationPC.serial}
                      {editingStation.stationPC.macAddress ? ` · ${editingStation.stationPC.macAddress}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                      editingStation.stationPC.status === 'online'
                        ? 'bg-green-100 text-green-700'
                        : editingStation.stationPC.status === 'offline'
                        ? 'bg-gray-200 text-gray-700'
                        : editingStation.stationPC.status === 'retired'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {t('stationPcs', `status${editingStation.stationPC.status.charAt(0).toUpperCase() + editingStation.stationPC.status.slice(1)}`)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 p-3 border border-dashed border-gray-300 rounded-lg">
                  <p className="text-sm text-gray-500 italic">{t('stations', 'stationPCNone')}</p>
                  <a
                    href="/admin/station-pcs"
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition whitespace-nowrap"
                  >
                    + {t('stations', 'stationPCAssign')}
                  </a>
                </div>
              )}
            </div>

            {/* Machines Section (from invoice items) */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{t('stations', 'machinesSection')}</h2>

              <MachineItems editingStation={editingStation} setEditingStation={setEditingStation} handleUpdateStation={handleUpdateStation} />

              {/* 8.1 — Invoice-anchored machines (Machine.invoiceId → StationInvoice).
                  Shown separately from StationMachine-linked machines, deduped by id. */}
              {(() => {
                const stationMachineIds = new Set(editingStation.machines.map((m) => m.id));
                const invoiceMachines = editingStation.invoices.flatMap((inv) =>
                  (inv.machines || []).map((m) => ({ ...m, invoiceNumber: inv.invoiceNumber }))
                );
                const uniqueInvoiceMachines = invoiceMachines.filter(
                  (m, idx, arr) =>
                    !stationMachineIds.has(m.id) &&
                    arr.findIndex((x) => x.id === m.id) === idx
                );
                if (uniqueInvoiceMachines.length === 0) return null;
                return (
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      {t('stations', 'invoiceAnchoredMachines') || 'On linked invoices'}
                    </h3>
                    <div className="space-y-2">
                      {uniqueInvoiceMachines.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 border border-dashed border-gray-300 rounded-lg bg-gray-50 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-900">
                                {m.model}
                              </span>
                              <span className="ml-2 text-xs text-gray-500">
                                SN {m.serialNumber}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">
                              Invoice #{(m as { invoiceNumber?: string }).invoiceNumber || '—'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {m.type} · {m.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Robot Status Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {t('stations', 'robotStatus')}
              </h2>

              {editingStation.robotPrograms.length === 0 ? (
                <p className="text-sm text-gray-500">{t('stations', 'noRobotStatus')}</p>
              ) : (
                <div className="space-y-2">
                  {editingStation.robotPrograms.map((program) => (
                    <div
                      key={program.id}
                      className="p-3 border border-gray-200 rounded-lg"
                    >
                      <div className="font-medium text-gray-900 text-sm">
                        {program.name}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                          {program.status}
                        </span>
                        {program.machineId && (
                          <span className="text-xs text-gray-600">
                            Machine: {program.machineId}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Laser Status Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {t('stations', 'laserStatus')}
              </h2>

              {editingStation.laserPresets.length === 0 ? (
                <p className="text-sm text-gray-500">{t('stations', 'noLaserStatus')}</p>
              ) : (
                <div className="space-y-2">
                  {editingStation.laserPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="p-3 border border-gray-200 rounded-lg"
                    >
                      <div className="font-medium text-gray-900 text-sm">
                        {preset.name}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                          {preset.status}
                        </span>
                        {preset.machineId && (
                          <span className="text-xs text-gray-600">
                            Machine: {preset.machineId}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delete Button */}
            <div className="mb-6">
              <button
                onClick={() => setConfirmDeleteId(editingStation?.id || null)}
                className="px-3 py-1.5 bg-red-400 text-white text-xs rounded-lg hover:bg-red-500 transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                {t('common', 'delete')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-500">{t('stations', 'selectStation')}</p>
            </div>
          </div>
        )}
      </div>

      {/* New Station Modal */}
      {showNewStationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{t('stations', 'newStation')}</h2>
              <button
                onClick={() => setShowNewStationModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {/* Client */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('stations', 'clientLabel')} *
                </label>
                <select
                  value={newStationForm.clientId}
                  onChange={(e) =>
                    setNewStationForm({ ...newStationForm, clientId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('stations', 'selectClient')}</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.qbClient.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('stations', 'titleRequired')}
                </label>
                <input
                  type="text"
                  value={newStationForm.title}
                  onChange={(e) =>
                    setNewStationForm({ ...newStationForm, title: e.target.value })
                  }
                  placeholder="e.g., Production Run"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('stations', 'notes')}
                </label>
                <textarea
                  value={newStationForm.notes}
                  onChange={(e) =>
                    setNewStationForm({ ...newStationForm, notes: e.target.value })
                  }
                  placeholder={`${t('common', 'optional')} ${t('stations', 'notes').toLowerCase()}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowNewStationModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                {t('common', 'cancel')}
              </button>
              <button
                onClick={handleCreateStation}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                {t('stations', 'createNewStation')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDeleteId && (
        <HoldToConfirm
          label={t('stations', 'deleteStationConfirm')}
          onConfirm={() => { handleDeleteStation(); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {/* Add Machine Modal */}
      {showAddMachineModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{t('stations', 'addMachine')}</h2>
              <button
                onClick={() => setShowAddMachineModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto mb-6">
              {getAvailableMachines().length === 0 ? (
                <p className="text-sm text-gray-500">
                  {t('stations', 'noMachinesAvailable')}
                </p>
              ) : (
                <div className="space-y-2">
                  {getAvailableMachines().map((machine) => (
                    <button
                      key={machine.id}
                      onClick={() => {
                        handleAddMachine(machine.id);
                      }}
                      className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition"
                    >
                      <div className="flex items-center gap-2">
                        {machine.type === 'robot' ? (
                          <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
                        ) : (
                          <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 text-sm">
                            {machine.serialNumber}
                          </div>
                          <div className="text-xs text-gray-600">
                            {machine.model}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowAddMachineModal(false)}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
            >
              {t('common', 'close')}
            </button>
          </div>
        </div>
      )}

      {/* Link Invoice Modal — 2 stages: invoice picker → line-item picker */}
      {showLinkInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                {pickerInvoiceId
                  ? t('stations', 'selectLineItems')
                  : t('stations', 'linkInvoice')}
              </h2>
              <button
                onClick={() => {
                  setShowLinkInvoiceModal(false);
                  setPickerInvoiceId(null);
                  setPickerSelections({});
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Stage 1 — invoice list */}
            {!pickerInvoiceId && (
              <>
                <div className="max-h-96 overflow-y-auto mb-6">
                  {getAvailableInvoices().length === 0 ? (
                    <p className="text-sm text-gray-500">{t('stations', 'noInvoicesAvailable')}</p>
                  ) : (
                    <div className="space-y-2">
                      {getAvailableInvoices().map((invoice) => {
                        const itemCount = invoice.items?.length || 0;
                        return (
                          <div
                            key={invoice.id}
                            className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 text-sm">
                                Invoice #{invoice.invoiceNumber}
                              </div>
                              <div className="text-xs text-gray-600">
                                {invoice.invoiceType}
                                {itemCount > 0 && ` · ${itemCount} line${itemCount === 1 ? '' : 's'}`}
                              </div>
                              {invoice.amount !== null && (
                                <div className="text-sm font-semibold text-gray-900 mt-1">
                                  ${invoice.amount.toFixed(2)}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                              {itemCount > 0 && (
                                <button
                                  onClick={() => openLineItemPicker(invoice.id)}
                                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition whitespace-nowrap"
                                >
                                  {t('stations', 'selectLineItems')}
                                </button>
                              )}
                              <button
                                onClick={() => handleLinkInvoice(invoice.id)}
                                className="px-3 py-1 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition whitespace-nowrap"
                              >
                                {t('stations', 'linkAll') || 'Link all'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowLinkInvoiceModal(false)}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  {t('common', 'close')}
                </button>
              </>
            )}

            {/* Stage 2 — line item picker for the chosen invoice */}
            {pickerInvoiceId && (() => {
              const inv = qbInvoices.find((i) => i.id === pickerInvoiceId);
              if (!inv) return null;
              return (
                <>
                  <div className="mb-3 text-xs text-gray-500">
                    Invoice #{inv.invoiceNumber}
                  </div>
                  <div className="max-h-96 overflow-y-auto mb-4 space-y-2 border border-gray-200 rounded-lg p-2">
                    {(inv.items || []).map((it, idx) => {
                      const qty = pickerSelections[idx] ?? 0;
                      const checked = qty > 0;
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 p-2 rounded-md ${checked ? 'bg-blue-50' : 'bg-white'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setPickerSelections((prev) => ({
                                ...prev,
                                [idx]: e.target.checked ? it.quantity : 0,
                              }))
                            }
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {it.description || it.model || '(no description)'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {it.model ? `${it.model} · ` : ''}
                              ${it.amount.toFixed(2)} total · ${it.rate.toFixed(2)}/unit
                            </div>
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={it.quantity}
                            step={1}
                            value={qty}
                            onChange={(e) => {
                              const v = Math.max(
                                0,
                                Math.min(it.quantity, parseInt(e.target.value) || 0)
                              );
                              setPickerSelections((prev) => ({ ...prev, [idx]: v }));
                            }}
                            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md"
                          />
                          <span className="text-xs text-gray-400 mt-2">/ {it.quantity}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setPickerInvoiceId(null);
                        setPickerSelections({});
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                    >
                      {t('common', 'back') || '← Back'}
                    </button>
                    <button
                      onClick={submitLineItemPicker}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                    >
                      {t('stations', 'addToStation') || 'Add to station'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
