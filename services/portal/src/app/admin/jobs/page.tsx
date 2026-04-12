'use client';

import { useState, useEffect } from 'react';

interface QBInvoice {
  id: string;
  docNumber: string;
  customerRef: { value: string; name: string };
  totalAmt: number;
  txnDate: string;
}

interface JobProgram {
  id: string;
  name: string;
  status: 'saved' | 'active' | 'archived';
  createdAt: string;
}

interface JobPreset {
  id: string;
  name: string;
  status: 'saved' | 'active' | 'archived';
  createdAt: string;
}

interface Job {
  id: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  title: string;
  machineType: 'robot' | 'laser' | 'robot_and_laser';
  robotModel?: string;
  laserModel?: string;
  robotSerialNumber?: string;
  laserSerialNumber?: string;
  status: 'draft' | 'in_progress' | 'testing' | 'completed' | 'archived';
  notes?: string;
  createdAt: string;
  invoices: QBInvoice[];
  programs: JobProgram[];
  presets: JobPreset[];
}

interface ManagedClient {
  id: string;
  qbClient: { displayName: string };
}

const statusBadgeColor = {
  draft: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  testing: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  archived: 'bg-gray-200 text-gray-600',
};

const statusLabel = {
  draft: 'Draft',
  in_progress: 'In Progress',
  testing: 'Testing',
  completed: 'Completed',
  archived: 'Archived',
};

const machineTypeIcons = {
  robot: (
    <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17l-5.1-3.26a2 2 0 01-.94-1.64V4.41a2 2 0 012.94-1.76l5.1 3.26a2 2 0 01.94 1.64v5.86a2 2 0 01-2.94 1.76zM20.16 12.83l-5.1 3.26a2 2 0 01-2.94-1.76V8.47a2 2 0 01.94-1.64l5.1-3.26a2 2 0 012.94 1.76v5.86a2 2 0 01-.94 1.64z" />
    </svg>
  ),
  laser: (
    <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  robot_and_laser: (
    <>
      <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17l-5.1-3.26a2 2 0 01-.94-1.64V4.41a2 2 0 012.94-1.76l5.1 3.26a2 2 0 01.94 1.64v5.86a2 2 0 01-2.94 1.76zM20.16 12.83l-5.1 3.26a2 2 0 01-2.94-1.76V8.47a2 2 0 01.94-1.64l5.1-3.26a2 2 0 012.94 1.76v5.86a2 2 0 01-.94 1.64z" />
      </svg>
      <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </>
  ),
};

const machineTypeLabel = {
  robot: 'Robot',
  laser: 'Laser',
  robot_and_laser: 'Robot & Laser',
};

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<ManagedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [showLinkInvoiceModal, setShowLinkInvoiceModal] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [availableInvoices, setAvailableInvoices] = useState<QBInvoice[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // New job form state
  const [newJob, setNewJob] = useState({
    clientId: '',
    title: '',
    machineType: 'robot' as const,
    robotModel: '',
    laserModel: '',
    robotSerialNumber: '',
    laserSerialNumber: '',
    notes: '',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load jobs and clients on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [jobsRes, clientsRes] = await Promise.all([
          fetch('/api/jobs'),
          fetch('/api/managed-clients'),
        ]);

        const jobsData = await jobsRes.json();
        const clientsData = await clientsRes.json();

        setJobs(jobsData.jobs || []);
        setClients(clientsData.clients || []);
      } catch (error) {
        console.error('Error loading jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;

  // Handle create new job
  const handleCreateJob = async () => {
    if (!newJob.clientId || !newJob.title.trim()) {
      setFormError('Client and Title are required');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJob),
      });

      const data = await res.json();

      if (data.job) {
        setJobs([...jobs, data.job]);
        setSelectedJobId(data.job.id);
        setShowNewJobModal(false);
        setNewJob({
          clientId: '',
          title: '',
          machineType: 'robot',
          robotModel: '',
          laserModel: '',
          robotSerialNumber: '',
          laserSerialNumber: '',
          notes: '',
        });
      }
    } catch (error) {
      console.error('Error creating job:', error);
      setFormError('Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (jobId: string, newStatus: Job['status']) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();

      if (data.job) {
        setJobs(jobs.map((j) => (j.id === jobId ? data.job : j)));
        if (selectedJobId === jobId) {
          setSelectedJob(data.job);
        }
      }
    } catch (error) {
      console.error('Error updating job status:', error);
    }
  };

  // Set selected job for detail panel
  const setSelectedJob = (job: Job) => {
    setSelectedJobId(job.id);
  };

  // Handle delete job
  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      setJobs(jobs.filter((j) => j.id !== jobId));
      if (selectedJobId === jobId) setSelectedJobId(null);
    } catch (error) {
      console.error('Error deleting job:', error);
    }
  };

  // Load QB invoices for linking
  const handleOpenLinkInvoice = async () => {
    setShowLinkInvoiceModal(true);
    setInvoiceLoading(true);

    try {
      const res = await fetch('/api/quickbooks/invoices');
      const data = await res.json();
      setAvailableInvoices(data.invoices || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setInvoiceLoading(false);
    }
  };

  // Handle link invoice
  const handleLinkInvoice = async (invoice: QBInvoice) => {
    if (!selectedJob) return;

    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });

      const data = await res.json();

      if (data.job) {
        setJobs(jobs.map((j) => (j.id === selectedJob.id ? data.job : j)));
        setSelectedJob(data.job);
        setShowLinkInvoiceModal(false);
      }
    } catch (error) {
      console.error('Error linking invoice:', error);
    }
  };

  const filteredInvoices = availableInvoices.filter(
    (inv) =>
      inv.docNumber.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.customerRef.name.toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Loading jobs...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left Panel - Jobs List */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <button
            onClick={() => setShowNewJobModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + New Job
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {jobs.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No jobs yet. Create your first job to get started.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedJobId === job.id
                      ? 'bg-blue-50 border-l-4 border-blue-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{job.jobNumber}</h3>
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            statusBadgeColor[job.status]
                          }`}
                        >
                          {statusLabel[job.status]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{job.title}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{job.clientName}</span>
                        <span className="flex items-center">
                          {machineTypeIcons[job.machineType]}
                          {machineTypeLabel[job.machineType]}
                        </span>
                        <span>{job.invoices.length} invoices</span>
                        <span>{job.programs.length} programs</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Job Details */}
      {selectedJob && (
        <div className="w-96 flex flex-col bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{selectedJob.jobNumber}</h2>

            {/* Status Dropdown */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={selectedJob.status}
                onChange={(e) => handleStatusChange(selectedJob.id, e.target.value as Job['status'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {(Object.keys(statusLabel) as Array<keyof typeof statusLabel>).map((status) => (
                  <option key={status} value={status}>
                    {statusLabel[status]}
                  </option>
                ))}
              </select>
            </div>

            {/* Job Info */}
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-600">Client:</span>
                <span className="ml-2 font-medium text-gray-900">{selectedJob.clientName}</span>
              </div>
              <div>
                <span className="text-gray-600">Title:</span>
                <span className="ml-2 font-medium text-gray-900">{selectedJob.title}</span>
              </div>
              <div>
                <span className="text-gray-600">Machine Type:</span>
                <span className="ml-2 font-medium text-gray-900 flex items-center">
                  {machineTypeIcons[selectedJob.machineType]}
                  {machineTypeLabel[selectedJob.machineType]}
                </span>
              </div>

              {selectedJob.robotModel && (
                <div>
                  <span className="text-gray-600">Robot Model:</span>
                  <span className="ml-2 font-medium text-gray-900">{selectedJob.robotModel}</span>
                </div>
              )}

              {selectedJob.robotSerialNumber && (
                <div>
                  <span className="text-gray-600">Robot S/N:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {selectedJob.robotSerialNumber}
                  </span>
                </div>
              )}

              {selectedJob.laserModel && (
                <div>
                  <span className="text-gray-600">Laser Model:</span>
                  <span className="ml-2 font-medium text-gray-900">{selectedJob.laserModel}</span>
                </div>
              )}

              {selectedJob.laserSerialNumber && (
                <div>
                  <span className="text-gray-600">Laser S/N:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {selectedJob.laserSerialNumber}
                  </span>
                </div>
              )}

              {selectedJob.notes && (
                <div>
                  <span className="text-gray-600">Notes:</span>
                  <p className="mt-1 text-gray-900 bg-gray-50 p-2 rounded text-xs whitespace-pre-wrap">
                    {selectedJob.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Invoices Section */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Invoices</h3>
                <button
                  onClick={handleOpenLinkInvoice}
                  className="text-xs px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                  Link Invoice
                </button>
              </div>

              {selectedJob.invoices.length === 0 ? (
                <p className="text-sm text-gray-500">No invoices linked</p>
              ) : (
                <div className="space-y-2">
                  {selectedJob.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{inv.docNumber}</p>
                        <p className="text-xs text-gray-600">${inv.totalAmt.toFixed(2)}</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await fetch(`/api/jobs/${selectedJob.id}/invoices/${inv.id}`, {
                              method: 'DELETE',
                            });
                            setJobs(
                              jobs.map((j) =>
                                j.id === selectedJob.id
                                  ? {
                                      ...j,
                                      invoices: j.invoices.filter((i) => i.id !== inv.id),
                                    }
                                  : j
                              )
                            );
                            setSelectedJob({
                              ...selectedJob,
                              invoices: selectedJob.invoices.filter((i) => i.id !== inv.id),
                            });
                          } catch (error) {
                            console.error('Error unlinking invoice:', error);
                          }
                        }}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Unlink
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Programs Section */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Robot Programs</h3>
                <button
                  disabled
                  className="text-xs px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Save program feature coming soon"
                >
                  Save Current
                </button>
              </div>

              {selectedJob.programs.length === 0 ? (
                <p className="text-sm text-gray-500">No programs saved</p>
              ) : (
                <div className="space-y-2">
                  {selectedJob.programs.map((prog) => (
                    <div key={prog.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{prog.name}</p>
                        <p className="text-xs text-gray-600">
                          {new Date(prog.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          prog.status === 'active'
                            ? 'bg-blue-100 text-blue-800'
                            : prog.status === 'saved'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {prog.status === 'active'
                          ? 'Active'
                          : prog.status === 'saved'
                            ? 'Saved'
                            : 'Archived'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Presets Section */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Laser Presets</h3>
                <button
                  disabled
                  className="text-xs px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Save preset feature coming soon"
                >
                  Save Current
                </button>
              </div>

              {selectedJob.presets.length === 0 ? (
                <p className="text-sm text-gray-500">No presets saved</p>
              ) : (
                <div className="space-y-2">
                  {selectedJob.presets.map((preset) => (
                    <div key={preset.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{preset.name}</p>
                        <p className="text-xs text-gray-600">
                          {new Date(preset.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          preset.status === 'active'
                            ? 'bg-blue-100 text-blue-800'
                            : preset.status === 'saved'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {preset.status === 'active'
                          ? 'Active'
                          : preset.status === 'saved'
                            ? 'Saved'
                            : 'Archived'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Delete Button */}
          <div className="p-6 border-t border-gray-200">
            <button
              onClick={() => handleDeleteJob(selectedJob.id)}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm"
            >
              Delete Job
            </button>
          </div>
        </div>
      )}

      {/* New Job Modal */}
      {showNewJobModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-900">Create New Job</h2>
            </div>

            <div className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-100 text-red-800 rounded-lg text-sm">{formError}</div>
              )}

              {/* Client Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client <span className="text-red-600">*</span>
                </label>
                <select
                  value={newJob.clientId}
                  onChange={(e) => setNewJob({ ...newJob, clientId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a client...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.qbClient.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={newJob.title}
                  onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                  placeholder="e.g., Custom Robot Arm Assembly"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Machine Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Machine Type <span className="text-red-600">*</span>
                </label>
                <div className="space-y-2">
                  {['robot', 'laser', 'robot_and_laser'].map((type) => (
                    <label key={type} className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="machineType"
                        value={type}
                        checked={newJob.machineType === type}
                        onChange={(e) =>
                          setNewJob({
                            ...newJob,
                            machineType: e.target.value as typeof newJob.machineType,
                          })
                        }
                        className="w-4 h-4"
                      />
                      <span className="ml-3 text-sm text-gray-700">
                        {type === 'robot'
                          ? 'Robot Only'
                          : type === 'laser'
                            ? 'Laser Only'
                            : 'Robot & Laser'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Robot Fields */}
              {(newJob.machineType === 'robot' || newJob.machineType === 'robot_and_laser') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Robot Model
                    </label>
                    <input
                      type="text"
                      value={newJob.robotModel}
                      onChange={(e) => setNewJob({ ...newJob, robotModel: e.target.value })}
                      placeholder="e.g., ABB IRB 1200"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Robot Serial Number
                    </label>
                    <input
                      type="text"
                      value={newJob.robotSerialNumber}
                      onChange={(e) => setNewJob({ ...newJob, robotSerialNumber: e.target.value })}
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {/* Laser Fields */}
              {(newJob.machineType === 'laser' || newJob.machineType === 'robot_and_laser') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Laser Model
                    </label>
                    <input
                      type="text"
                      value={newJob.laserModel}
                      onChange={(e) => setNewJob({ ...newJob, laserModel: e.target.value })}
                      placeholder="e.g., CO2 100W"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Laser Serial Number
                    </label>
                    <input
                      type="text"
                      value={newJob.laserSerialNumber}
                      onChange={(e) => setNewJob({ ...newJob, laserSerialNumber: e.target.value })}
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={newJob.notes}
                  onChange={(e) => setNewJob({ ...newJob, notes: e.target.value })}
                  placeholder="Add any additional notes about this job..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3 sticky bottom-0">
              <button
                onClick={() => setShowNewJobModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateJob}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Invoice Modal */}
      {showLinkInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-900">Link Invoice</h2>
            </div>

            <div className="p-6">
              {invoiceLoading ? (
                <div className="text-center py-8 text-gray-600">Loading invoices...</div>
              ) : (
                <>
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Search invoices..."
                      value={invoiceSearch}
                      onChange={(e) => setInvoiceSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {filteredInvoices.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">No invoices found</div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filteredInvoices.map((inv) => (
                        <button
                          key={inv.id}
                          onClick={() => handleLinkInvoice(inv)}
                          className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{inv.docNumber}</p>
                              <p className="text-sm text-gray-600">{inv.customerRef.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-gray-900">
                                ${inv.totalAmt.toFixed(2)}
                              </p>
                              <p className="text-sm text-gray-600">
                                {new Date(inv.txnDate).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowLinkInvoiceModal(false)}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
