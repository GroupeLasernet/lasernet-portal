'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

const HoldToConfirm = ({ onConfirm, onCancel, label = 'Are you sure?' }: { onConfirm: () => void; onCancel: () => void; label?: string }) => {
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
          <button onClick={onCancel} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition">No</button>
          <button
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            className="flex-1 px-4 py-2 bg-red-400 text-white rounded-lg text-sm font-medium transition relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-red-600 transition-none" style={{ width: `${progress * 100}%` }} />
            <span className="relative">{holding ? 'Hold...' : 'Yes (hold 2s)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const HoldToSaveButton = ({ onSave }: { onSave: () => void }) => {
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
      <span className="relative">{saved ? 'Saved!' : holding ? 'Hold...' : 'Save (hold 2s)'}</span>
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

interface JobInvoice {
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

interface Job {
  id: string;
  jobNumber: string;
  clientId: string;
  client: {
    displayName: string;
    companyName: string;
    email: string;
  };
  title: string;
  notes?: string;
  status: 'not_configured' | 'waiting_pairing' | 'in_trouble' | 'active' | 'draft' | 'in_progress' | 'testing' | 'completed' | 'archived';
  invoices: JobInvoice[];
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
const MachineItems = ({ editingJob, setEditingJob, handleUpdateJob }: {
  editingJob: Job;
  setEditingJob: (job: Job) => void;
  handleUpdateJob: (updates: Partial<Job>) => Promise<void>;
}) => {
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(editingJob.notes || '{}'); } catch { /* not JSON */ }
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
  }, [editingJob.id]);

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">No machines (no invoice items linked)</p>;
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
    const updated = { ...editingJob, notes: newNotes };
    setEditingJob(updated);

    if (allFilled && editingJob.status === 'not_configured') {
      handleUpdateJob({ notes: newNotes, status: 'waiting_pairing' as Job['status'] });
    } else {
      handleUpdateJob({ notes: newNotes });
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
                {(item.sourceInvoiceNumber || meta.invoiceNumber) && (
                  <div className="mt-1 text-xs text-gray-400">Invoice #{String(item.sourceInvoiceNumber || meta.invoiceNumber || '')}</div>
                )}
              </div>
            </div>

            {/* Machine Type Dropdown */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Machine Type</label>
              <select
                value={md.machineType || ''}
                onChange={(e) => saveMachineField(i, 'machineType', e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select type...</option>
                <option value="cobot">Cobot</option>
                <option value="laser">Laser Machine</option>
              </select>
            </div>

            {/* Serial Number with Hold-to-Save */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Serial Number</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={serialInputs[i] || ''}
                  onChange={(e) => setSerialInputs(prev => ({ ...prev, [i]: e.target.value }))}
                  placeholder="Enter serial number..."
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
                  Saved: {md.serialNumber}
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

interface QBInvoice {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  amount: number | null;
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ManagedClient[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [qbInvoices, setQBInvoices] = useState<QBInvoice[]>([]);

  // Modal states
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [showAddMachineModal, setShowAddMachineModal] = useState(false);
  const [showLinkInvoiceModal, setShowLinkInvoiceModal] = useState(false);

  // Form states
  const [newJobForm, setNewJobForm] = useState({
    clientId: '',
    title: '',
    notes: '',
  });

  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
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
    fetchJobs();
    fetchClients();
    fetchQBInvoices();
  }, [fetchJobs, fetchClients, fetchQBInvoices]);

  // Load machines when job is selected
  useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find((j) => j.id === selectedJobId);
      if (job) {
        setEditingJob(job);
        fetchMachinesForClient(job.clientId);
      }
    }
  }, [selectedJobId, jobs, fetchMachinesForClient]);

  // Create new job
  const handleCreateJob = async () => {
    try {
      if (!newJobForm.clientId || !newJobForm.title.trim()) {
        setError('Client and title are required');
        return;
      }

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managedClientId: newJobForm.clientId,
          title: newJobForm.title,
          notes: newJobForm.notes,
        }),
      });

      if (!res.ok) throw new Error('Failed to create job');
      const data = await res.json();

      setJobs([...jobs, data.job]);
      setShowNewJobModal(false);
      setNewJobForm({ clientId: '', title: '', notes: '' });
      setSelectedJobId(data.job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    }
  };

  // Update job
  const handleUpdateJob = async (updates: Partial<Job>) => {
    if (!selectedJobId) return;

    try {
      const res = await fetch(`/api/jobs/${selectedJobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update job');
      const data = await res.json();

      setJobs(jobs.map((j) => (j.id === selectedJobId ? data.job : j)));
      setEditingJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    }
  };

  // Add machine to job
  const handleAddMachine = async (machineId: string) => {
    if (!selectedJobId) return;

    try {
      const res = await fetch(`/api/jobs/${selectedJobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addMachineId: machineId }),
      });

      if (!res.ok) throw new Error('Failed to add machine');
      const data = await res.json();

      setJobs(jobs.map((j) => (j.id === selectedJobId ? data.job : j)));
      setEditingJob(data.job);
      setShowAddMachineModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add machine');
    }
  };

  // Remove machine from job
  const handleRemoveMachine = async (machineId: string) => {
    if (!selectedJobId) return;

    try {
      const res = await fetch(`/api/jobs/${selectedJobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeMachineId: machineId }),
      });

      if (!res.ok) throw new Error('Failed to remove machine');
      const data = await res.json();

      setJobs(jobs.map((j) => (j.id === selectedJobId ? data.job : j)));
      setEditingJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove machine');
    }
  };

  // Link invoice to job
  const handleLinkInvoice = async (invoiceId: string) => {
    if (!selectedJobId) return;

    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });

      if (!res.ok) throw new Error('Failed to link invoice');
      const data = await res.json();

      setJobs(jobs.map((j) => (j.id === selectedJobId ? data.job : j)));
      setEditingJob(data.job);
      setShowLinkInvoiceModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link invoice');
    }
  };

  // Unlink invoice from job
  const handleUnlinkInvoice = async (invoiceId: string) => {
    if (!selectedJobId) return;

    try {
      const res = await fetch(
        `/api/jobs/${selectedJobId}/invoices/${invoiceId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to unlink invoice');
      const data = await res.json();

      setJobs(jobs.map((j) => (j.id === selectedJobId ? data.job : j)));
      setEditingJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink invoice');
    }
  };

  // Delete job
  const handleDeleteJob = async () => {
    if (!selectedJobId) return;

    try {
      const res = await fetch(`/api/jobs/${selectedJobId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete job');

      setJobs(jobs.filter((j) => j.id !== selectedJobId));
      setSelectedJobId(null);
      setEditingJob(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  // Helper to count machines from notes JSON (invoice items + machineData)
  const getMachineCount = (job: Job) => {
    try {
      const meta = JSON.parse(job.notes || '{}');
      const items = meta.items || [];
      const machineData: { serialNumber?: string; machineType?: string }[] = meta.machineData || [];

      if (items.length === 0) return 'No machines';

      const cobots = machineData.filter(md => md?.machineType === 'cobot').length;
      const lasers = machineData.filter(md => md?.machineType === 'laser').length;
      const untyped = items.length - cobots - lasers;

      const parts = [];
      if (cobots > 0) parts.push(`${cobots} cobot${cobots !== 1 ? 's' : ''}`);
      if (lasers > 0) parts.push(`${lasers} laser${lasers !== 1 ? 's' : ''}`);
      if (untyped > 0) parts.push(`${untyped} unassigned`);

      // Show serial numbers if any
      const serials = machineData.filter(md => md?.serialNumber).length;
      if (serials > 0) {
        return `${parts.join(', ')} (${serials}/${items.length} serial#)`;
      }

      return parts.length > 0 ? parts.join(', ') : `${items.length} machine${items.length !== 1 ? 's' : ''}`;
    } catch {
      return 'No machines';
    }
  };

  // Get available machines (not yet in job)
  const getAvailableMachines = () => {
    if (!editingJob) return [];
    const assignedIds = new Set(editingJob.machines.map((m) => m.id));
    return machines.filter((m) => !assignedIds.has(m.id));
  };

  // Get available invoices (not yet in job)
  const getAvailableInvoices = () => {
    if (!editingJob) return [];
    const linkedIds = new Set(editingJob.invoices.map((inv) => inv.qbInvoiceId));
    return qbInvoices.filter((inv) => !linkedIds.has(inv.id));
  };

  // Filter jobs by business name search
  const filteredJobs = searchFilter.trim()
    ? jobs.filter((j) =>
        j.client.displayName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        j.client.companyName.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : jobs;

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

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

      {/* Left Panel: Job List */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        {/* Header with Search */}
        <div className="border-b border-gray-200 p-4">
          <h1 className="text-xl font-bold text-gray-900 mb-3">Stations</h1>
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              placeholder="Search by business name..."
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

        {/* Jobs List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p className="text-sm">{searchFilter ? 'No stations match your search' : 'No stations yet'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition border-l-4 ${
                    selectedJobId === job.id
                      ? 'border-l-blue-600 bg-blue-50'
                      : 'border-l-transparent'
                  }`}
                >
                  <div className="font-semibold text-gray-900 text-sm truncate">
                    {job.title}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {job.client.displayName}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {getMachineCount(job)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        job.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : job.status === 'archived'
                            ? 'bg-gray-100 text-gray-800'
                            : job.status === 'testing'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Job Details */}
      <div className="flex-1 overflow-y-auto">
        {selectedJob && editingJob ? (
          <div className="p-6 max-w-4xl">
            {/* Job Info Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Station Info</h2>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Station Name
                  </label>
                  <input
                    type="text"
                    value={editingJob.title}
                    onChange={(e) => {
                      const updated = { ...editingJob, title: e.target.value };
                      setEditingJob(updated);
                    }}
                    onBlur={() =>
                      handleUpdateJob({ title: editingJob.title })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editingJob.status}
                    onChange={(e) => {
                      const updated = {
                        ...editingJob,
                        status: e.target.value as Job['status'],
                      };
                      setEditingJob(updated);
                      handleUpdateJob({
                        status: e.target.value as Job['status'],
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="not_configured">Not fully configured</option>
                    <option value="waiting_pairing">Configured / Waiting for first pairing</option>
                    <option value="in_trouble">In trouble</option>
                    <option value="active">Working / Active</option>
                  </select>
                </div>

                {/* Client */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client
                  </label>
                  <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                    {editingJob.client.displayName}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={(() => { try { const m = JSON.parse(editingJob.notes || '{}'); return m.description || ''; } catch { return editingJob.notes || ''; } })()}
                    onChange={(e) => {
                      let meta: Record<string, unknown> = {};
                      try { meta = JSON.parse(editingJob.notes || '{}'); } catch { /* not JSON */ }
                      meta.description = e.target.value;
                      const updated = { ...editingJob, notes: JSON.stringify(meta) };
                      setEditingJob(updated);
                    }}
                    onBlur={() =>
                      handleUpdateJob({ notes: editingJob.notes })
                    }
                    placeholder="Add a description for this station..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                </div>

                {/* Linked Invoice(s) Info */}
                {(() => {
                  try {
                    const meta = JSON.parse(editingJob.notes || '{}');
                    const invoices: { id: string; number: string }[] = meta.invoices || [];
                    // Fallback: if no invoices array but has invoiceNumber
                    if (invoices.length === 0 && meta.invoiceNumber) {
                      invoices.push({ id: meta.invoiceId, number: meta.invoiceNumber });
                    }
                    if (invoices.length > 0) {
                      return (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Linked Invoice{invoices.length > 1 ? 's' : ''}
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
              <h2 className="text-lg font-bold text-gray-900 mb-4">Machines</h2>

              <MachineItems editingJob={editingJob} setEditingJob={setEditingJob} handleUpdateJob={handleUpdateJob} />
            </div>

            {/* Robot Status Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                Robot Status
              </h2>

              {editingJob.robotPrograms.length === 0 ? (
                <p className="text-sm text-gray-500">No robot status entries</p>
              ) : (
                <div className="space-y-2">
                  {editingJob.robotPrograms.map((program) => (
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
                Laser Status
              </h2>

              {editingJob.laserPresets.length === 0 ? (
                <p className="text-sm text-gray-500">No laser status entries</p>
              ) : (
                <div className="space-y-2">
                  {editingJob.laserPresets.map((preset) => (
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
                onClick={() => setConfirmDeleteId(editingJob?.id || null)}
                className="px-3 py-1.5 bg-red-400 text-white text-xs rounded-lg hover:bg-red-500 transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-500">Select a station to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* New Job Modal */}
      {showNewJobModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">New Station</h2>
              <button
                onClick={() => setShowNewJobModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {/* Client */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client *
                </label>
                <select
                  value={newJobForm.clientId}
                  onChange={(e) =>
                    setNewJobForm({ ...newJobForm, clientId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a client</option>
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
                  Title *
                </label>
                <input
                  type="text"
                  value={newJobForm.title}
                  onChange={(e) =>
                    setNewJobForm({ ...newJobForm, title: e.target.value })
                  }
                  placeholder="e.g., Production Run"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={newJobForm.notes}
                  onChange={(e) =>
                    setNewJobForm({ ...newJobForm, notes: e.target.value })
                  }
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowNewJobModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateJob}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Create Station
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDeleteId && (
        <HoldToConfirm
          label="Delete this station?"
          onConfirm={() => { handleDeleteJob(); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {/* Add Machine Modal */}
      {showAddMachineModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Add Machine</h2>
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
                  All machines are already assigned
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
              Close
            </button>
          </div>
        </div>
      )}

      {/* Link Invoice Modal */}
      {showLinkInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Link Invoice</h2>
              <button
                onClick={() => setShowLinkInvoiceModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto mb-6">
              {getAvailableInvoices().length === 0 ? (
                <p className="text-sm text-gray-500">No available invoices</p>
              ) : (
                <div className="space-y-2">
                  {getAvailableInvoices().map((invoice) => (
                    <button
                      key={invoice.id}
                      onClick={() => {
                        handleLinkInvoice(invoice.id);
                      }}
                      className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition"
                    >
                      <div className="font-medium text-gray-900 text-sm">
                        Invoice #{invoice.invoiceNumber}
                      </div>
                      <div className="text-xs text-gray-600">
                        {invoice.invoiceType}
                      </div>
                      {invoice.amount !== null && (
                        <div className="text-sm font-semibold text-gray-900 mt-1">
                          ${invoice.amount.toFixed(2)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowLinkInvoiceModal(false)}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
