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
    if (!selectedJobId || !window.confirm('Delete this job permanently?')) return;

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

  // Helper to count machines by type
  const getMachineCount = (job: Job) => {
    const robots = job.machines.filter((m) => m.type === 'robot').length;
    const lasers = job.machines.filter((m) => m.type === 'laser').length;

    const parts = [];
    if (robots > 0) parts.push(`${robots} robot${robots !== 1 ? 's' : ''}`);
    if (lasers > 0) parts.push(`${lasers} laser${lasers !== 1 ? 's' : ''}`);

    return parts.length > 0 ? parts.join(', ') : 'No machines';
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
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900">Stations</h1>
            <button
              onClick={() => setShowNewJobModal(true)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
        </div>

        {/* Jobs List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p className="text-sm">No stations yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {jobs.map((job) => (
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

                {/* Invoice Items (read-only) */}
                {(() => {
                  try {
                    const meta = JSON.parse(editingJob.notes || '{}');
                    if (meta.items && meta.items.length > 0) {
                      return (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Invoice Items {meta.invoiceNumber ? `(#${meta.invoiceNumber})` : ''}
                          </label>
                          <div className="space-y-1">
                            {meta.items.map((item: { description: string; quantity: number }, i: number) => (
                              <div key={i} className="text-xs bg-gray-50 rounded px-3 py-2 text-gray-600">
                                {item.description} {item.quantity > 1 ? `× ${item.quantity}` : ''}
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

            {/* Machines Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Machines</h2>
                <button
                  onClick={() => setShowAddMachineModal(true)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Machine
                </button>
              </div>

              {editingJob.machines.length === 0 ? (
                <p className="text-sm text-gray-500">No machines assigned</p>
              ) : (
                <div className="space-y-2">
                  {editingJob.machines.map((machine) => (
                    <div
                      key={machine.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {machine.type === 'robot' ? (
                          <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
                        ) : (
                          <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 text-sm">
                            {machine.serialNumber} ({machine.type})
                          </div>
                          <div className="text-xs text-gray-600">
                            {machine.model}
                          </div>
                          {machine.ipAddress && (
                            <div className="text-xs text-gray-500">
                              {machine.ipAddress}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                              {machine.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMachine(machine.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition flex-shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Invoices</h2>
                <button
                  onClick={() => setShowLinkInvoiceModal(true)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Link Invoice
                </button>
              </div>

              {editingJob.invoices.length === 0 ? (
                <p className="text-sm text-gray-500">No invoices linked</p>
              ) : (
                <div className="space-y-2">
                  {editingJob.invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
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
                          {invoice.machines.length > 0 && (
                            <div className="mt-2 text-xs text-gray-600 space-y-1">
                              <div className="font-medium">Linked machines:</div>
                              {invoice.machines.map((m) => (
                                <div key={m.id} className="pl-2">
                                  • {m.serialNumber} ({m.type})
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleUnlinkInvoice(invoice.qbInvoiceId)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Robot Programs Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                Robot Programs
              </h2>

              {editingJob.robotPrograms.length === 0 ? (
                <p className="text-sm text-gray-500">No robot programs</p>
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

            {/* Laser Presets Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                Laser Presets
              </h2>

              {editingJob.laserPresets.length === 0 ? (
                <p className="text-sm text-gray-500">No laser presets</p>
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
