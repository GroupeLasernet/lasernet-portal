'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

interface Machine {
  id: string;
  serialNumber: string;
  type: 'robot' | 'laser';
  model: string;
  nickname?: string;
  ipAddress?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  status: 'active' | 'in_repair' | 'refunded' | 'decommissioned';
  client: { id: string; displayName: string; companyName: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
  recentEvents: { id: string; eventType: string; notes?: string; createdAt: string }[];
  stations: { id: string; stationNumber: string; title: string; status: string }[];
  // §9.1 licensing fields
  licenseMode?: 'unlicensed' | 'sold' | 'rented' | 'killed';
  expiresAt?: string | null;
  killSwitchActive?: boolean;
  licenseLastCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ManagedClient {
  id: string;
  displayName: string;
  companyName: string;
}

type ViewMode = 'list' | 'map';
type TypeFilter = 'all' | 'robot' | 'laser';
type StatusFilter = 'all' | 'active' | 'in_repair' | 'refunded' | 'decommissioned';

function getStatusConfig(t: (section: string, key: string) => string) {
  return {
    active: { label: t('machines', 'activeStatus'), color: 'bg-green-100 text-green-800', badge: 'bg-green-500' },
    in_repair: { label: t('machines', 'inRepair'), color: 'bg-yellow-100 text-yellow-800', badge: 'bg-yellow-500' },
    refunded: { label: t('machines', 'refunded'), color: 'bg-red-100 text-red-800', badge: 'bg-red-500' },
    decommissioned: { label: t('machines', 'decommissioned'), color: 'bg-gray-100 text-gray-800', badge: 'bg-gray-500' },
  };
}

export default function MachinesPage() {
  const { t, lang } = useLanguage();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [clients, setClients] = useState<ManagedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);

  useEffect(() => {
    fetchMachines();
    fetchClients();
  }, [typeFilter, statusFilter, searchTerm]);

  const fetchMachines = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/machines?${params.toString()}`);
      const data = await response.json();

      let filtered = data.machines || [];
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter((m: Machine) =>
          m.serialNumber.toLowerCase().includes(term) ||
          m.model.toLowerCase().includes(term) ||
          m.client?.displayName.toLowerCase().includes(term) ||
          m.client?.companyName.toLowerCase().includes(term)
        );
      }

      setMachines(filtered);
    } catch (error) {
      console.error('Failed to fetch machines:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/managed-clients');
      const data = await response.json();
      setClients(data.clients || []);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const handleDeleteMachine = async (id: string) => {
    if (!confirm('Are you sure? This will soft-delete the machine.')) return;

    try {
      const response = await fetch(`/api/machines/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setMachines(machines.filter(m => m.id !== id));
        setSelectedMachine(null);
      }
    } catch (error) {
      console.error('Failed to delete machine:', error);
    }
  };

  const handleStatusChange = async (machineId: string, newStatus: 'active' | 'in_repair' | 'refunded' | 'decommissioned', event?: { type: string; notes?: string; address?: string; city?: string; province?: string; postalCode?: string; ipAddress?: string; toClientId?: string }) => {
    try {
      const payload = event ? { event: { ...event, type: event.type || newStatus } } : { status: newStatus };

      const response = await fetch(`/api/machines/${machineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        fetchMachines();
        if (selectedMachine?.id === machineId) {
          const updated = machines.find(m => m.id === machineId);
          if (updated) setSelectedMachine(updated);
        }
      }
    } catch (error) {
      console.error('Failed to update machine status:', error);
    }
  };

  const handleRelocate = async (machineId: string, address: string, city: string, province: string, postalCode: string) => {
    await handleStatusChange(machineId, 'active', {
      type: 'relocated',
      address,
      city,
      province,
      postalCode,
    });
  };

  const handleReassign = async (machineId: string, newClientId: string) => {
    await handleStatusChange(machineId, 'active', {
      type: 'reassigned',
      toClientId: newClientId,
    });
  };

  const filteredMachines = machines;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('machines', 'title')}</h1>
              <p className="text-gray-500 mt-1">{t('machines', 'subtitle')}</p>
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              {t('machines', 'newMachine')}
            </button>
          </div>

          {/* Filters and Controls */}
          <div className="space-y-4">
            {/* Filter Buttons */}
            <div className="flex gap-2 flex-wrap">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 rounded font-medium transition ${typeFilter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'allFilter')}
                </button>
                <button
                  onClick={() => setTypeFilter('robot')}
                  className={`px-3 py-1 rounded font-medium transition ${typeFilter === 'robot' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'robots')}
                </button>
                <button
                  onClick={() => setTypeFilter('laser')}
                  className={`px-3 py-1 rounded font-medium transition ${typeFilter === 'laser' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'lasers')}
                </button>
              </div>

              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded font-medium transition text-sm ${statusFilter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'allStatus')}
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1 rounded font-medium transition text-sm ${statusFilter === 'active' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'activeStatus')}
                </button>
                <button
                  onClick={() => setStatusFilter('in_repair')}
                  className={`px-3 py-1 rounded font-medium transition text-sm ${statusFilter === 'in_repair' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'inRepair')}
                </button>
                <button
                  onClick={() => setStatusFilter('refunded')}
                  className={`px-3 py-1 rounded font-medium transition text-sm ${statusFilter === 'refunded' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'refunded')}
                </button>
              </div>
            </div>

            {/* Search and View Toggle */}
            <div className="flex gap-4 items-center">
              <input
                type="text"
                placeholder={t('machines', 'searchMachines')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 rounded font-medium transition ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'listView')}
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-3 py-1 rounded font-medium transition ${viewMode === 'map' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t('machines', 'mapView')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : viewMode === 'list' ? (
          <ListView machines={filteredMachines} onSelectMachine={setSelectedMachine} statusConfig={getStatusConfig(t)} />
        ) : (
          <MapView machines={filteredMachines} statusConfig={getStatusConfig(t)} />
        )}
      </div>

      {/* Detail Panel */}
      {selectedMachine && !showEditPanel && (
        <DetailPanel
          machine={selectedMachine}
          onClose={() => setSelectedMachine(null)}
          onEdit={() => setShowEditPanel(true)}
          onStatusChange={handleStatusChange}
          onRelocate={handleRelocate}
          onReassign={handleReassign}
          onDelete={handleDeleteMachine}
          clients={clients}
          statusConfig={getStatusConfig(t)}
        />
      )}

      {/* New Machine Modal */}
      {showNewModal && (
        <NewMachineModal
          onClose={() => setShowNewModal(false)}
          onSuccess={() => {
            fetchMachines();
            setShowNewModal(false);
          }}
          clients={clients}
        />
      )}
    </div>
  );
}

function ListView({ machines, onSelectMachine, statusConfig }: { machines: Machine[]; onSelectMachine: (m: Machine) => void; statusConfig: ReturnType<typeof getStatusConfig> }) {
  const { t } = useLanguage();
  if (machines.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-gray-600 text-lg">{t('machines', 'noMachinesFound')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {machines.map((machine) => (
        <button
          key={machine.id}
          onClick={() => onSelectMachine(machine)}
          className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition text-left"
        >
          <div className="flex items-start justify-between">
            <div className="flex gap-4 flex-1">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-blue-600">
                    {machine.type === 'robot' ? 'R' : 'L'}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">{machine.serialNumber}</h3>
                  <span className="text-sm text-gray-600">{machine.model}</span>
                  {machine.nickname && (
                    <span className="text-sm bg-blue-50 text-blue-700 px-2 py-1 rounded">
                      {machine.nickname}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                  {machine.client && (
                    <span>{machine.client.displayName}</span>
                  )}
                  {machine.ipAddress && (
                    <div className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" /></svg>
                      <span className="font-mono text-xs">{machine.ipAddress}</span>
                    </div>
                  )}
                  {machine.city && machine.province && (
                    <div className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span>{machine.city}, {machine.province}</span>
                    </div>
                  )}
                </div>

                {machine.invoice && (
                  <div className="text-xs text-gray-500">
                    Invoice: {machine.invoice.invoiceNumber}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 ml-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig[machine.status].color}`}>
                {statusConfig[machine.status].label}
              </span>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function MapView({ machines, statusConfig }: { machines: Machine[]; statusConfig: ReturnType<typeof getStatusConfig> }) {
  const { t } = useLanguage();
  const grouped: { [key: string]: Machine[] } = {};

  machines.forEach((m) => {
    const location = m.city && m.province ? `${m.city}, ${m.province}` : 'Unknown Location';
    if (!grouped[location]) grouped[location] = [];
    grouped[location].push(m);
  });

  return (
    <div className="grid gap-6">
      {Object.entries(grouped).map(([location, locationMachines]) => (
        <div key={location} className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">{location}</h3>
              <p className="text-sm text-gray-600">{locationMachines.length} machine(s)</p>
            </div>
            {locationMachines[0].latitude && locationMachines[0].longitude && (
              <a
                href={`https://www.google.com/maps?q=${locationMachines[0].latitude},${locationMachines[0].longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {t('common', 'download')}
              </a>
            )}
          </div>

          <div className="space-y-2">
            {locationMachines.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium text-gray-900">{m.serialNumber} - {m.model}</p>
                  <p className="text-sm text-gray-600">{m.client?.displayName || t('machines', 'unassigned')}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusConfig[m.status].color}`}>
                  {statusConfig[m.status].label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-gray-600 text-lg">{t('machines', 'noMachinesLocation')}</p>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  machine,
  onClose,
  onEdit,
  onStatusChange,
  onRelocate,
  onReassign,
  onDelete,
  clients,
  statusConfig,
}: {
  machine: Machine;
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (id: string, status: any, event?: any) => Promise<void>;
  onRelocate: (id: string, address: string, city: string, province: string, postalCode: string) => Promise<void>;
  onReassign: (id: string, clientId: string) => Promise<void>;
  onDelete: (id: string) => void;
  clients: ManagedClient[];
  statusConfig: ReturnType<typeof getStatusConfig>;
}) {
  const { t } = useLanguage();
  const [showRelocateForm, setShowRelocateForm] = useState(false);
  const [showReassignForm, setShowReassignForm] = useState(false);
  const [relocateData, setRelocateData] = useState({ address: machine.address || '', city: machine.city || '', province: machine.province || '', postalCode: machine.postalCode || '' });
  const [selectedClientId, setSelectedClientId] = useState('');

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-lg z-50 overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">{machine.serialNumber}</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl"
        >
          ×
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Machine Info */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">{t('machines', 'machineDetails')}</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-600">{t('machines', 'type')}:</span>
              <span className="ml-2 font-medium text-gray-900 capitalize">{machine.type}</span>
            </div>
            <div>
              <span className="text-gray-600">{t('machines', 'modelRequired')}:</span>
              <span className="ml-2 font-medium text-gray-900">{machine.model}</span>
            </div>
            {machine.nickname && (
              <div>
                <span className="text-gray-600">{t('machines', 'nickname')}:</span>
                <span className="ml-2 font-medium text-gray-900">{machine.nickname}</span>
              </div>
            )}
            {machine.ipAddress && (
              <div>
                <span className="text-gray-600">{t('machines', 'ipAddress')}:</span>
                <span className="ml-2 font-medium text-gray-900 font-mono">{machine.ipAddress}</span>
              </div>
            )}
          </div>
        </div>

        {/* Address Info */}
        {(machine.address || machine.city || machine.province) && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">{t('machines', 'location')}</h3>
            <div className="space-y-1 text-sm text-gray-600">
              {machine.address && <p>{machine.address}</p>}
              {machine.city && machine.province && <p>{machine.city}, {machine.province}</p>}
              {machine.postalCode && <p>{machine.postalCode}</p>}
              {machine.country && <p>{machine.country}</p>}
            </div>
          </div>
        )}

        {/* Client Info */}
        {machine.client && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">{t('machines', 'client')}</h3>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="font-medium text-blue-900">{machine.client.displayName}</p>
              <p className="text-sm text-blue-700">{machine.client.companyName}</p>
            </div>
          </div>
        )}

        {/* Invoice Info */}
        {machine.invoice && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">{t('machines', 'invoice')}</h3>
            <p className="text-sm text-gray-600">{t('machines', 'invoice')}: {machine.invoice.invoiceNumber}</p>
          </div>
        )}

        {/* Status Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">{t('common', 'status')}</h3>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig[machine.status].color}`}>
              {statusConfig[machine.status].label}
            </span>
          </div>

          <div className="space-y-2">
            {machine.status === 'active' && (
              <>
                <button
                  onClick={() => onStatusChange(machine.id, 'in_repair', { type: 'repair_started' })}
                  className="w-full px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition text-sm font-medium"
                >
                  {t('machines', 'sendToRepair')}
                </button>
                <button
                  onClick={() => onStatusChange(machine.id, 'refunded', { type: 'refunded' })}
                  className="w-full px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition text-sm font-medium"
                >
                  {t('machines', 'refund')}
                </button>
                <button
                  onClick={() => setShowRelocateForm(true)}
                  className="w-full px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
                >
                  {t('machines', 'relocate')}
                </button>
                <button
                  onClick={() => setShowReassignForm(true)}
                  className="w-full px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
                >
                  {t('machines', 'reassign')}
                </button>
              </>
            )}

            {machine.status === 'in_repair' && (
              <button
                onClick={() => onStatusChange(machine.id, 'active', { type: 'repair_completed' })}
                className="w-full px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition text-sm font-medium"
              >
                {t('machines', 'reactivate')}
              </button>
            )}
          </div>
        </div>

        {/* Relocate Form */}
        {showRelocateForm && (
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-semibold text-gray-900 text-sm">{t('machines', 'newLocation')}</h4>
            <input
              type="text"
              placeholder={t('machines', 'address')}
              value={relocateData.address}
              onChange={(e) => setRelocateData({ ...relocateData, address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder={t('machines', 'city')}
              value={relocateData.city}
              onChange={(e) => setRelocateData({ ...relocateData, city: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder={t('machines', 'province')}
              value={relocateData.province}
              onChange={(e) => setRelocateData({ ...relocateData, province: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder={t('machines', 'postalCode')}
              value={relocateData.postalCode}
              onChange={(e) => setRelocateData({ ...relocateData, postalCode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onRelocate(machine.id, relocateData.address, relocateData.city, relocateData.province, relocateData.postalCode);
                  setShowRelocateForm(false);
                }}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                {t('common', 'confirm')}
              </button>
              <button
                onClick={() => setShowRelocateForm(false)}
                className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300"
              >
                {t('common', 'cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Reassign Form */}
        {showReassignForm && (
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-semibold text-gray-900 text-sm">{t('machines', 'selectNewClient')}</h4>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('machines', 'chooseClient')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} ({c.companyName})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (selectedClientId) {
                    onReassign(machine.id, selectedClientId);
                    setShowReassignForm(false);
                  }
                }}
                disabled={!selectedClientId}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('common', 'confirm')}
              </button>
              <button
                onClick={() => setShowReassignForm(false)}
                className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300"
              >
                {t('common', 'cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Events */}
        {machine.recentEvents.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">{t('machines', 'eventHistory')}</h3>
            <div className="space-y-3">
              {machine.recentEvents.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {event.eventType.replace(/_/g, ' ')}
                    </p>
                    {event.notes && (
                      <p className="text-sm text-gray-600">{event.notes}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(event.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stations */}
        {machine.stations.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">{t('machines', 'linkedStations')}</h3>
            <div className="space-y-2">
              {machine.stations.map((station) => (
                <div key={station.id} className="p-2 bg-gray-50 rounded text-sm">
                  <p className="font-medium text-gray-900">{station.stationNumber}</p>
                  <p className="text-gray-600">{station.title}</p>
                  <p className="text-xs text-gray-500">{station.status}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* §9.1 Licensing panel */}
        <LicensePanel machine={machine} />

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-gray-200">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            {t('common', 'edit')}
          </button>
          <button
            onClick={() => onDelete(machine.id)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            {t('common', 'delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewMachineModal({
  onClose,
  onSuccess,
  clients,
}: {
  onClose: () => void;
  onSuccess: () => void;
  clients: ManagedClient[];
}) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    type: 'robot' as 'robot' | 'laser',
    serialNumber: '',
    model: '',
    nickname: '',
    ipAddress: '',
    clientId: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    country: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        type: formData.type,
        serialNumber: formData.serialNumber,
        model: formData.model,
        nickname: formData.nickname || undefined,
        ipAddress: formData.ipAddress || undefined,
        managedClientId: formData.clientId || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        province: formData.province || undefined,
        postalCode: formData.postalCode || undefined,
        country: formData.country || undefined,
      };

      const response = await fetch('/api/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onSuccess();
      }
    } catch (error) {
      console.error('Failed to create machine:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">{t('machines', 'newMachine')}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">{t('stations', 'machineType')}</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value="robot"
                  checked={formData.type === 'robot'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'robot' | 'laser' })}
                  className="w-4 h-4"
                />
                <span className="text-gray-700">{t('machines', 'robots')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value="laser"
                  checked={formData.type === 'laser'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'robot' | 'laser' })}
                  className="w-4 h-4"
                />
                <span className="text-gray-700">{t('machines', 'lasers')}</span>
              </label>
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'serialNumberRequired')}</label>
              <input
                type="text"
                required
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., SN-2024-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'modelRequired')}</label>
              <input
                type="text"
                required
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., UR10e"
              />
            </div>
          </div>

          {/* Nickname */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'nickname')}</label>
            <input
              type="text"
              value={formData.nickname}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Main Assembly Bot"
            />
          </div>

          {/* IP Address */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'ipAddress')}</label>
            <input
              type="text"
              value={formData.ipAddress}
              onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 192.168.1.100"
            />
          </div>

          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'clientOptional')}</label>
            <select
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t('machines', 'unassigned')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} ({c.companyName})
                </option>
              ))}
            </select>
          </div>

          {/* Address Fields */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'address')}</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Street address"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'city')}</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="City"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'province')}</label>
              <input
                type="text"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Province/State"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'postalCode')}</label>
              <input
                type="text"
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Postal code"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">{t('machines', 'country')}</label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Country"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
            >
              {t('common', 'cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? t('common', 'uploading') : t('machines', 'newMachine')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================
// §9.1 LicensePanel — inline license admin controls on each card.
// Calls PATCH /api/machines/license/<serialNumber>.
// =============================================================
function LicensePanel({ machine }: { machine: Machine }) {
  const [mode, setMode] = useState<'unlicensed' | 'sold' | 'rented' | 'killed'>(
    machine.licenseMode || 'unlicensed'
  );
  const [expiresAt, setExpiresAt] = useState<string>(
    machine.expiresAt ? machine.expiresAt.slice(0, 10) : ''
  );
  const [killSwitch, setKillSwitch] = useState<boolean>(!!machine.killSwitchActive);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/machines/license/${encodeURIComponent(machine.serialNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseMode: mode,
          expiresAt:
            mode === 'rented' && expiresAt
              ? new Date(expiresAt + 'T00:00:00Z').toISOString()
              : null,
          killSwitchActive: killSwitch,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Update failed');
      }
      setMsg('Saved. Robot will sync on next heartbeat.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const badgeColor =
    mode === 'killed'
      ? 'bg-red-100 text-red-800'
      : mode === 'rented'
      ? 'bg-amber-100 text-amber-800'
      : mode === 'sold'
      ? 'bg-green-100 text-green-800'
      : 'bg-gray-100 text-gray-800';

  return (
    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Licensing</h3>
        <span className={`text-xs px-2 py-0.5 rounded ${badgeColor}`}>{mode}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col">
          <span className="text-gray-600 mb-1">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="border border-gray-300 rounded px-2 py-1"
          >
            <option value="unlicensed">Unlicensed</option>
            <option value="sold">Sold (unlimited)</option>
            <option value="rented">Rented</option>
            <option value="killed">Killed</option>
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600 mb-1">Expires (rented only)</span>
          <input
            type="date"
            value={expiresAt}
            disabled={mode !== 'rented'}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 disabled:bg-gray-100"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 mt-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={killSwitch}
          onChange={(e) => setKillSwitch(e.target.checked)}
        />
        Kill-switch active (refuse operation immediately)
      </label>

      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span>
          Last check:{' '}
          {machine.licenseLastCheckedAt
            ? new Date(machine.licenseLastCheckedAt).toLocaleString()
            : 'never'}
        </span>
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>

      {msg && <p className="mt-1 text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
