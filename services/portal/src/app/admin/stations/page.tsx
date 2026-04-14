'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

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
  };
  title: string;
  notes?: string;
  status: 'not_configured' | 'waiting_pairing' | 'in_trouble' | 'active' | 'draft' | 'in_progress' | 'testing' | 'completed' | 'archived';
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
  createdAt: string;
  updatedAt: string;
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
  const items: { description: string; quantity: number; model?: string; sourceInvoiceNumber?: string }[] = (meta.items as { description: string; quantity: number; model?: string; sourceInvoiceNumber?: string }[]) || [];
  const machineData: { serialNumber?: string; machineType?: string }[] = (meta.machineData as { serialNumber?: string; machineType?: string }[]) || [];

  // Local state for serial number inputs
  const [serialInputs, setSerialInputs] = useState<Record<number, string>>({});

  // Initialize serial inputs from saved data
  useEffect(() => {
    const initial: Record<number, string> = {};
    items.forEach((_, i) => {
      const md = machineData[i];
      if (md?.serialNumber) initial[i] = md.serialNumber;
    });
    setSerialInputs(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingStation.id]);

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{t('stations', 'noMachines')}</p>;
  }

  const saveMachineField = (index: number, field: string, value: string) => {
    const freshMeta = { ...meta };
    if (!freshMeta.machineData) freshMeta.machineData = [];
    const md = freshMeta.machineData as { serialNumber?: string; machineType?: string }[];
    while (md.length <= index) md.push({});
    md[index] = { ...md[index], [field]: value };

    // Auto-update status: if all serial numbers filled → waiting_pairing
    const allFilled = items.every((_, i) => {
      const m = md[i];
      return m && m.serialNumber && m.serialNumber.trim() !== '';
    });

    const newNotes = JSON.stringify(freshMeta);
    const updated = { ...editingStation, notes: newNotes };
    setEditingStation(updated);

    if (allFilled && editingStation.status === 'not_configured') {
      handleUpdateStation({ notes: newNotes, status: 'waiting_pairing' as Station['status'] });
    } else {
      handleUpdateStation({ notes: newNotes });
    }
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const md = machineData[i] || {};
        return (
          <div key={i} className="p-4 border border-gray-200 rounded-lg">
            {/* Model (left) + Description (right) */}
            <div className="flex items-start gap-3 mb-3">
              {(md.machineType === 'laser') ? (
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
            </div>

            {/* Machine Type Dropdown */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('stations', 'machineType')}</label>
              <select
                value={md.machineType || ''}
                onChange={(e) => saveMachineField(i, 'machineType', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t('stations', 'selectType')}</option>
                <option value="cobot">{t('stations', 'cobot')}</option>
                <option value="laser">{t('stations', 'laserMachine')}</option>
              </select>
            </div>

            {/* Serial Number with Hold-to-Save */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('stations', 'serialNumber')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={serialInputs[i] || ''}
                  onChange={(e) => setSerialInputs(prev => ({ ...prev, [i]: e.target.value }))}
                  placeholder={t('stations', 'enterSerial')}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <HoldToSaveButton
                  onSave={() => {
                    const val = serialInputs[i] || '';
                    if (val.trim()) saveMachineField(i, 'serialNumber', val.trim());
                  }}
                />
              </div>
              {md.serialNumber && (
                <div className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {t('common', 'save')}: {md.serialNumber}
                </div>
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

  // Helper to count machines from notes JSON (invoice items + machineData)
  const getMachineCount = (station: Station) => {
    try {
      const meta = JSON.parse(station.notes || '{}');
      const items = meta.items || [];
      const machineData: { serialNumber?: string; machineType?: string }[] = meta.machineData || [];

      if (items.length === 0) return t('stations', 'noMachines');

      const cobots = machineData.filter(md => md?.machineType === 'cobot').length;
      const lasers = machineData.filter(md => md?.machineType === 'laser').length;
      const untyped = items.length - cobots - lasers;

      const parts = [];
      if (cobots > 0) parts.push(`${cobots} ${t('stations', 'cobot')}${cobots !== 1 ? 's' : ''}`);
      if (lasers > 0) parts.push(`${lasers} ${t('stations', 'laserMachine')}${lasers !== 1 ? 's' : ''}`);
      if (untyped > 0) parts.push(`${untyped} unassigned`);

      // Show serial numbers if any
      const serials = machineData.filter(md => md?.serialNumber).length;
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

  // Get available invoices (not yet in station)
  const getAvailableInvoices = () => {
    if (!editingStation) return [];
    const linkedIds = new Set(editingStation.invoices.map((inv) => inv.qbInvoiceId));
    return qbInvoices.filter((inv) => !linkedIds.has(inv.id));
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
    <div className="flex h-screen bg-gray-50">
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

      {/* Left Panel: Station List */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        {/* Header with Search */}
        <div className="border-b border-gray-200 p-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{t('stations', 'title')}</h1>
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
                    if (invoices.length > 0) {
                      return (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {invoices.length > 1 ? t('stations', 'linkedInvoices') : t('stations', 'linkInvoice')}
                          </label>
                          <div className="space-y-1">
                            {invoices.map((inv, idx) => (
                              <div key={idx} className="text-sm bg-blue-50 rounded-lg px-3 py-2 text-blue-700 font-medium">
                                Invoice #{inv.number}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  } catch { /* not JSON */ }
                  return null;
                })()}
              </div>
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
  );
}
