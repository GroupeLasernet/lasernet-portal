'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { type QBClient, type ManagedClient, type ContactPerson } from '@/lib/mock-data';
import Avatar from '@/components/Avatar';
import StreetView from '@/components/StreetView';

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    fill="none" viewBox="0 0 24 24" stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

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

interface QBInvoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amount: number;
  balance: number;
  status: string;
  date: string;
  dueDate: string;
  items: { description: string; model?: string; quantity: number; rate: number; amount: number }[];
}

interface Station {
  id: string;
  name: string;
  description?: string;
  invoiceId: string;
  invoiceNumber: string;
  items: { description: string; quantity: number; rate: number; amount: number }[];
  status: 'not_configured' | 'waiting_pairing' | 'in_trouble' | 'active';
  createdAt: string;
}

export default function AdminClientsPage() {
  const [qbClients, setQbClients] = useState<QBClient[]>([]);
  const [qbSearch, setQbSearch] = useState('');
  const [qbConnected, setQbConnected] = useState(false);
  const [qbLoading, setQbLoading] = useState(true);
  const [dataSource, setDataSource] = useState<string>('');
  const [credentialsConfigured, setCredentialsConfigured] = useState(true);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [managedClients, setManagedClients] = useState<ManagedClient[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [showContactForm, setShowContactForm] = useState(false);
  const [contactFormType, setContactFormType] = useState<'responsible' | 'employee'>('responsible');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<Omit<ContactPerson, 'id'>>({
    photo: null, name: '', email: '', phone: '', role: '',
    trainingPhoto: null, trainingInvoiceId: null, trainingCompleted: false,
  });

  const [streetViewOpen, setStreetViewOpen] = useState(true);
  const [mainContactOpen, setMainContactOpen] = useState(true);
  const [staffOpen, setStaffOpen] = useState(true);

  const [clientInvoices, setClientInvoices] = useState<QBInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesSource, setInvoicesSource] = useState<string>('');

  // Invoice preview & Station creation state
  const [previewInvoice, setPreviewInvoice] = useState<QBInvoice | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [stationName, setStationName] = useState('');
  const [clientStations, setClientStations] = useState<Station[]>([]);
  const [stationsOpen, setStationsOpen] = useState(true);
  // Station assignment: 'new' | 'existing'
  const [stationMode, setStationMode] = useState<'new' | 'existing'>('new');
  const [selectedExistingStationId, setSelectedExistingStationId] = useState<string | null>(null);
  // Quantity split: for multi-unit items, how many stations to create
  const [itemQuantities, setItemQuantities] = useState<Record<number, number>>({});

  const [resetLockouts, setResetLockouts] = useState<Record<string, number>>({});
  const [resetCountdowns, setResetCountdowns] = useState<Record<string, number>>({});
  const [resetSending, setResetSending] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      const now = Date.now();
      setResetCountdowns((prev) => {
        const updated: Record<string, number> = {};
        let hasActive = false;
        for (const [email, expiry] of Object.entries(resetLockouts)) {
          const remaining = Math.ceil((expiry - now) / 1000);
          if (remaining > 0) { updated[email] = remaining; hasActive = true; }
        }
        return hasActive ? updated : {};
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [resetLockouts]);

  const handleResetPassword = async (email: string, name: string) => {
    if (resetLockouts[email] && Date.now() < resetLockouts[email]) return;
    setResetSending(true);
    setResetMessage(null);
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = await response.json();
      setResetMessage(data.emailSent ? `Reset email sent to ${email}` : (data.message || 'Reset link generated (email not configured)'));
      setResetLockouts((prev) => ({ ...prev, [email]: Date.now() + 120000 }));
    } catch { setResetMessage('Failed to send reset email'); }
    setResetSending(false);
  };

  useEffect(() => {
    fetch('/api/managed-clients').then(r => r.json()).then(data => {
      if (data.clients) setManagedClients(data.clients);
      setHasLoaded(true);
    }).catch(() => setHasLoaded(true));
  }, []);

  useEffect(() => {
    fetch('/api/quickbooks/status').then(r => r.json()).then(data => {
      setQbConnected(data.connected);
      setCredentialsConfigured(data.credentialsConfigured !== false);
    }).catch(() => {});
    fetch('/api/quickbooks/customers').then(r => r.json()).then(data => {
      setQbClients(data.customers || []);
      setDataSource(data.source || 'mock');
      setQbLoading(false);
    }).catch(() => setQbLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedClientId) { setClientInvoices([]); setClientStations([]); return; }
    const client = managedClients.find((mc) => mc.id === selectedClientId);
    if (!client) return;
    // Strip 'qb-' prefix if present to get the real QuickBooks customer ID
    const rawQbId = client.qbClient.id.replace(/^qb-/, '');
    const clientName = client.qbClient.displayName;
    setInvoicesLoading(true);
    fetch(`/api/quickbooks/invoices?customerId=${rawQbId}`).then(r => r.json()).then(data => {
      const allInvoices: QBInvoice[] = data.invoices || [];
      // Match by raw QB ID or client display name
      const filtered = allInvoices.filter(inv =>
        inv.clientId === rawQbId ||
        inv.clientName === clientName ||
        inv.clientName.toLowerCase() === clientName.toLowerCase()
      );
      setClientInvoices(filtered);
      setInvoicesSource(data.source || 'mock');
      setInvoicesLoading(false);
    }).catch(() => { setClientInvoices([]); setInvoicesLoading(false); });

    // Load stations for this client (stations are stored as Jobs in the DB)
    fetch(`/api/jobs?clientId=${selectedClientId}`).then(r => r.json()).then(data => {
      const jobs = data.jobs || [];
      const stations: Station[] = jobs.map((job: Record<string, unknown>) => {
        let items: { description: string; quantity: number; rate: number; amount: number }[] = [];
        let invoiceId = '';
        let invoiceNumber = '';
        let description = '';
        try {
          const meta = JSON.parse((job.notes as string) || '{}');
          items = meta.items || [];
          invoiceId = meta.invoiceId || '';
          invoiceNumber = meta.invoiceNumber || '';
          description = meta.description || '';
        } catch { /* notes not JSON, that's fine */ }
        return {
          id: job.id as string,
          name: job.title as string,
          description,
          invoiceId,
          invoiceNumber,
          items,
          status: (job.status as 'not_configured' | 'waiting_pairing' | 'in_trouble' | 'active') || 'not_configured',
          createdAt: job.createdAt as string,
        };
      });
      setClientStations(stations);
    }).catch(() => setClientStations([]));
  }, [selectedClientId, managedClients]);

  const handleConnectQB = async () => {
    setConnectError(null);
    try {
      const res = await fetch('/api/quickbooks/connect');
      const data = await res.json();
      if (data.authUrl) { window.location.href = data.authUrl; }
      else { setConnectError(data.details || data.error || 'Could not generate QuickBooks auth URL.'); }
    } catch { setConnectError('Failed to connect to QuickBooks. The server may be unreachable.'); }
  };

  const addedQbIds = new Set(managedClients.map((mc) => mc.qbClient.id));
  const filteredQBClients = qbClients.filter(c =>
    !addedQbIds.has(c.id) &&
    qbSearch.trim().length > 0 &&
    (c.displayName.toLowerCase().includes(qbSearch.toLowerCase()) ||
      c.companyName.toLowerCase().includes(qbSearch.toLowerCase()))
  );

  const handleAddClient = async (qbClient: QBClient) => {
    try {
      const res = await fetch('/api/managed-clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qbClient }),
      });
      const data = await res.json();
      if (data.client) {
        setManagedClients([...managedClients, data.client]);
        setSelectedClientId(data.client.id);
        setQbSearch('');
      }
    } catch (error) { console.error('Error adding client:', error); }
  };

  const handleRemoveClient = async (clientId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}`, { method: 'DELETE' });
      setManagedClients(managedClients.filter((mc) => mc.id !== clientId));
      if (selectedClientId === clientId) setSelectedClientId(null);
    } catch (error) { console.error('Error removing client:', error); }
  };

  const selectedClient = managedClients.find((mc) => mc.id === selectedClientId) || null;

  const openContactForm = (type: 'responsible' | 'employee') => {
    setContactFormType(type); setEditingContactId(null);
    setContactForm({ photo: null, name: '', email: '', phone: '', role: '' });
    setShowContactForm(true);
  };

  const openEditForm = (type: 'responsible' | 'employee', contact: ContactPerson) => {
    setContactFormType(type); setEditingContactId(contact.id);
    setContactForm({ photo: contact.photo, name: contact.name, email: contact.email, phone: contact.phone, role: contact.role });
    setResetMessage(null); setShowContactForm(true);
  };

  const handleSaveContact = async () => {
    if (!selectedClient || !contactForm.name.trim() || !contactForm.email.trim()) return;
    if (editingContactId) {
      try {
        const res = await fetch(`/api/managed-clients/${selectedClient.id}/contacts/${editingContactId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contactForm),
        });
        const data = await res.json();
        if (data.contact) {
          setManagedClients(managedClients.map((mc) => {
            if (mc.id !== selectedClient.id) return mc;
            if (contactFormType === 'responsible' && mc.responsiblePerson?.id === editingContactId) return { ...mc, responsiblePerson: { ...data.contact, id: editingContactId } };
            return { ...mc, subEmployees: mc.subEmployees.map(e => e.id === editingContactId ? { ...data.contact, id: editingContactId } : e) };
          }));
        }
      } catch (error) { console.error('Error updating contact:', error); }
      setShowContactForm(false); setEditingContactId(null);
    } else {
      try {
        const res = await fetch(`/api/managed-clients/${selectedClient.id}/contacts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...contactForm, type: contactFormType }),
        });
        const data = await res.json();
        if (data.contact) {
          setManagedClients(managedClients.map((mc) => {
            if (mc.id !== selectedClient.id) return mc;
            if (contactFormType === 'responsible') return { ...mc, responsiblePerson: data.contact };
            return { ...mc, subEmployees: [...mc.subEmployees, data.contact] };
          }));
        }
      } catch (error) { console.error('Error adding contact:', error); }
      try {
        await fetch('/api/invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: contactForm.email, name: contactForm.name, role: contactForm.role || 'Staff Member', companyName: selectedClient.qbClient.companyName }),
        });
      } catch (error) { console.error('Error sending invitation:', error); }
      setShowContactForm(false); setEditingContactId(null);
    }
  };

  const handleRemoveEmployee = async (clientId: string, employeeId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${employeeId}`, { method: 'DELETE' });
      setManagedClients(managedClients.map((mc) => {
        if (mc.id !== clientId) return mc;
        return { ...mc, subEmployees: mc.subEmployees.filter(e => e.id !== employeeId) };
      }));
    } catch (error) { console.error('Error removing staff member:', error); }
  };

  const handleRemoveResponsible = async (clientId: string) => {
    const client = managedClients.find((mc) => mc.id === clientId);
    if (!client?.responsiblePerson) return;
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${client.responsiblePerson.id}`, { method: 'DELETE' });
      setManagedClients(managedClients.map((mc) => {
        if (mc.id !== clientId) return mc;
        return { ...mc, responsiblePerson: null };
      }));
    } catch (error) { console.error('Error removing main contact:', error); }
  };

  // Invoice preview handlers
  const openInvoicePreview = (invoice: QBInvoice) => {
    setPreviewInvoice(invoice);
    setSelectedItems(new Set());
    setStationName('');
    setStationMode(clientStations.length > 0 ? 'existing' : 'new');
    setSelectedExistingStationId(clientStations.length > 0 ? clientStations[0].id : null);
    setItemQuantities({});
  };

  const toggleItem = (index: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAllItems = () => {
    if (!previewInvoice) return;
    if (selectedItems.size === previewInvoice.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(previewInvoice.items.map((_, i) => i)));
    }
  };

  const handleCreateStation = async () => {
    if (!previewInvoice || selectedItems.size === 0 || !selectedClient) return;
    const items = previewInvoice.items
      .map((item, i) => ({ item, index: i }))
      .filter(({ index }) => selectedItems.has(index))
      .map(({ item, index }) => {
        const qty = itemQuantities[index] || item.quantity;
        return { ...item, quantity: qty };
      });

    if (stationMode === 'existing' && selectedExistingStationId) {
      // Add items to existing station — update notes JSON, preserve multiple invoices
      const existing = clientStations.find(s => s.id === selectedExistingStationId);
      if (existing) {
        // Tag each new item with its source invoice
        const taggedItems = items.map(it => ({ ...it, sourceInvoiceId: previewInvoice.id, sourceInvoiceNumber: previewInvoice.invoiceNumber }));
        const updatedItems = [...existing.items, ...taggedItems];
        // Build invoices array for multi-invoice support
        let existingMeta: Record<string, unknown> = {};
        try {
          const raw = await fetch(`/api/jobs/${selectedExistingStationId}`).then(r => r.json());
          existingMeta = JSON.parse(raw.job?.notes || '{}');
        } catch { /* fallback */ }
        const invoices: { id: string; number: string }[] = (existingMeta.invoices as { id: string; number: string }[]) || [];
        if (existingMeta.invoiceId && !invoices.find((inv: { id: string }) => inv.id === existingMeta.invoiceId)) {
          invoices.push({ id: existingMeta.invoiceId as string, number: existingMeta.invoiceNumber as string });
        }
        if (!invoices.find((inv: { id: string }) => inv.id === previewInvoice.id)) {
          invoices.push({ id: previewInvoice.id, number: previewInvoice.invoiceNumber });
        }
        const notes = JSON.stringify({ ...existingMeta, invoiceId: existingMeta.invoiceId || previewInvoice.id, invoiceNumber: existingMeta.invoiceNumber || previewInvoice.invoiceNumber, invoices, items: updatedItems });
        setClientStations(prev => prev.map(s => s.id !== selectedExistingStationId ? s : { ...s, items: updatedItems }));
        fetch(`/api/jobs/${selectedExistingStationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        }).catch(() => {});
      }
    } else {
      // Create new station via /api/jobs
      const name = stationName.trim() || `Station — ${previewInvoice.invoiceNumber}`;
      const notes = JSON.stringify({ invoiceId: previewInvoice.id, invoiceNumber: previewInvoice.invoiceNumber, items });

      try {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            managedClientId: selectedClient.id,
            title: name,
            notes,
          }),
        });
        const data = await res.json();
        if (data.job) {
          setClientStations(prev => [...prev, {
            id: data.job.id,
            name: data.job.title,
            invoiceId: previewInvoice.id,
            invoiceNumber: previewInvoice.invoiceNumber,
            items,
            status: 'not_configured',
            createdAt: data.job.createdAt,
          }]);
        }
      } catch (err) {
        console.error('Failed to create station:', err);
      }
    }

    setSelectedItems(new Set());
    setStationName('');
    setItemQuantities({});
    setPreviewInvoice(null);
  };

  const handleDeleteStation = (stationId: string) => {
    setClientStations(prev => prev.filter(s => s.id !== stationId));
    fetch(`/api/jobs/${stationId}`, { method: 'DELETE' }).catch(() => {});
  };

  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editingStationName, setEditingStationName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; id2?: string; label: string } | null>(null);

  const executeConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    switch (confirmDelete.type) {
      case 'station': handleDeleteStation(confirmDelete.id); break;
      case 'client': handleRemoveClient(confirmDelete.id); break;
      case 'responsible': handleRemoveResponsible(confirmDelete.id); break;
      case 'employee': handleRemoveEmployee(confirmDelete.id, confirmDelete.id2 || ''); break;
    }
    setConfirmDelete(null);
  }, [confirmDelete]);

  const handleRenameStation = (stationId: string, newName: string) => {
    if (!newName.trim()) return;
    setClientStations(prev => prev.map(s => s.id === stationId ? { ...s, name: newName.trim() } : s));
    setEditingStationId(null);
    fetch(`/api/jobs/${stationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newName.trim() }),
    }).catch(() => {});
  };

  const EditIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );

  const TrashIcon = ({ size = 'w-5 h-5' }: { size?: string }) => (
    <svg className={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  const formatDate = (dateStr: string) => { if (!dateStr) return '\u2014'; return new Date(dateStr).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }); };
  const stationStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'waiting_pairing': return 'bg-blue-100 text-blue-700';
      case 'not_configured': return 'bg-yellow-100 text-yellow-700';
      case 'in_trouble': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const stationStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Working / Active';
      case 'waiting_pairing': return 'Configured / Waiting for first pairing';
      case 'not_configured': return 'Not fully configured';
      case 'in_trouble': return 'In trouble';
      default: return status;
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-gray-500 mt-1">Import clients from QuickBooks and manage their contacts</p>
      </div>

      <div className="flex gap-6 h-[calc(100vh-180px)]">
        {/* ============================================================ */}
        {/* LEFT PANEL: QuickBooks Search + Enrolment List */}
        {/* ============================================================ */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-4">
          {/* QuickBooks Search Section */}
          <div className="card !p-0 flex-shrink-0">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 ${qbConnected && dataSource === 'quickbooks' ? 'bg-green-100' : 'bg-yellow-100'} rounded flex items-center justify-center`}>
                    <span className={`${qbConnected && dataSource === 'quickbooks' ? 'text-green-600' : 'text-yellow-600'} text-xs font-bold`}>QB</span>
                  </div>
                  <h2 className="font-semibold text-sm">QuickBooks Clients</h2>
                </div>
                {(!qbConnected || (qbConnected && dataSource === 'mock')) && !qbLoading && (
                  <button onClick={handleConnectQB} className="text-[10px] bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded transition-colors">
                    {qbConnected && dataSource === 'mock' ? 'Reconnect' : 'Connect'}
                  </button>
                )}
              </div>
              {!credentialsConfigured && (
                <p className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded mb-2">
                  QuickBooks credentials are missing. Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in Vercel, then redeploy.
                </p>
              )}
              {connectError && (
                <p className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded mb-2">{connectError}</p>
              )}
              {dataSource === 'mock' && credentialsConfigured && (
                <p className="text-[10px] text-yellow-600 bg-yellow-50 px-2 py-1 rounded mb-2">
                  {qbConnected ? 'QuickBooks session expired \u2014 click Reconnect' : 'Showing demo data \u2014 connect QuickBooks for real clients'}
                </p>
              )}
              {dataSource === 'quickbooks' && (
                <p className="text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded mb-2">Connected \u2014 showing live QuickBooks data</p>
              )}
              <input
                type="text"
                placeholder="Search QuickBooks clients..."
                value={qbSearch}
                onChange={(e) => setQbSearch(e.target.value)}
                className="input-field text-sm !py-2"
              />
            </div>

            {/* Search results — only show when typing */}
            {qbSearch.trim().length > 0 && (
              <div className="border-t border-gray-100 max-h-[200px] overflow-y-auto">
                {filteredQBClients.length > 0 ? (
                  filteredQBClients.map((client) => (
                    <div key={client.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar photo={null} name={client.displayName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{client.displayName}</p>
                          <p className="text-xs text-gray-500 truncate">{client.companyName}</p>
                        </div>
                      </div>
                      <button onClick={() => handleAddClient(client)} className="flex-shrink-0 ml-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">Add</button>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-sm text-gray-400">No matching clients</div>
                )}
              </div>
            )}
          </div>

          {/* Enrolment List */}
          <div className="card flex-1 flex flex-col !p-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Enrolment
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {managedClients.length > 0 ? (
                managedClients.map((mc) => (
                  <div
                    key={mc.id}
                    onClick={() => setSelectedClientId(mc.id)}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors ${
                      selectedClientId === mc.id ? 'bg-brand-50 border-l-2 border-l-brand-600' : 'hover:bg-gray-50'
                    }`}
                  >
                    <Avatar photo={null} name={mc.qbClient.displayName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{mc.qbClient.displayName}</p>
                      <p className="text-xs text-gray-500 truncate">{mc.qbClient.companyName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {mc.responsiblePerson && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Main Contact set</span>
                        )}
                        {mc.subEmployees.length > 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{mc.subEmployees.length} staff</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center">
                  <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm text-gray-400">No clients enrolled yet</p>
                  <p className="text-xs text-gray-400 mt-1">Search QuickBooks above to add clients</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                {managedClients.length} client{managedClients.length !== 1 ? 's' : ''} enrolled
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT PANEL: Client Detail + Invoices + Stations */}
        {/* ============================================================ */}
        <div className="flex-1 flex flex-col min-w-0 gap-4 overflow-y-auto">
          {selectedClient ? (
            <>
              <div className="card !p-0">
                {/* Client Header */}
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-brand-50 to-white">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar photo={null} name={selectedClient.qbClient.displayName} size="lg" />
                      <div>
                        <h2 className="text-lg font-bold">{selectedClient.qbClient.displayName}</h2>
                        <p className="text-sm text-gray-500">{selectedClient.qbClient.companyName}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span>{selectedClient.qbClient.email}</span>
                          <span>{selectedClient.qbClient.phone}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {selectedClient.qbClient.address}, {selectedClient.qbClient.city}, {selectedClient.qbClient.province} {selectedClient.qbClient.postalCode}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setConfirmDelete({ type: 'client', id: selectedClient.id, label: 'Remove this client?' })} className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">Remove</button>
                  </div>
                </div>

                {/* Street View — Collapsible */}
                {(selectedClient.qbClient.address || selectedClient.qbClient.city) && (
                  <div className="border-b border-gray-100">
                    <button onClick={() => setStreetViewOpen(!streetViewOpen)} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <ChevronIcon open={streetViewOpen} />
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">Street View</span>
                    </button>
                    {streetViewOpen && (
                      <div className="px-5 pb-4">
                        <StreetView address={selectedClient.qbClient.address} city={selectedClient.qbClient.city} province={selectedClient.qbClient.province} postalCode={selectedClient.qbClient.postalCode} className="h-[180px]" />
                      </div>
                    )}
                  </div>
                )}

                {/* Main Contact — Collapsible */}
                <div className="border-b border-gray-100">
                  <div className="flex items-center justify-between px-5">
                    <button onClick={() => setMainContactOpen(!mainContactOpen)} className="flex items-center gap-2 py-3 hover:opacity-80 transition-opacity">
                      <ChevronIcon open={mainContactOpen} />
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900">Main Contact</span>
                    </button>
                    {!selectedClient.responsiblePerson && mainContactOpen && (
                      <button onClick={() => openContactForm('responsible')} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors">+ Set Main Contact</button>
                    )}
                  </div>
                  {mainContactOpen && (
                    <div className="px-5 pb-4">
                      {selectedClient.responsiblePerson ? (
                        <div className="flex items-center gap-4 bg-green-50 rounded-xl p-4">
                          <Avatar photo={selectedClient.responsiblePerson.photo} name={selectedClient.responsiblePerson.name} size="lg" />
                          <div className="flex-1">
                            <p className="font-semibold flex items-center gap-1.5">{selectedClient.responsiblePerson.name}
                              {selectedClient.responsiblePerson.trainingInvoiceId ? (
                                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              )}
                            </p>
                            <p className="text-sm text-gray-600">{selectedClient.responsiblePerson.role}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                              <span>{selectedClient.responsiblePerson.email}</span>
                              <span>{selectedClient.responsiblePerson.phone}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditForm('responsible', selectedClient.responsiblePerson!)} className="text-gray-400 hover:text-brand-600 transition-colors p-1.5 rounded-lg hover:bg-white" title="Edit"><EditIcon /></button>
                            <button onClick={() => setConfirmDelete({ type: 'responsible', id: selectedClient.id, label: 'Remove the main contact?' })} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-white" title="Remove"><TrashIcon /></button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No main contact assigned yet</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Staff — Collapsible */}
                <div>
                  <div className="flex items-center justify-between px-5">
                    <button onClick={() => setStaffOpen(!staffOpen)} className="flex items-center gap-2 py-3 hover:opacity-80 transition-opacity">
                      <ChevronIcon open={staffOpen} />
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900">Staff</span>
                      {selectedClient.subEmployees.length > 0 && <span className="text-xs text-gray-400 ml-1">({selectedClient.subEmployees.length})</span>}
                    </button>
                    {staffOpen && (
                      <button onClick={() => openContactForm('employee')} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">+ Add Staff</button>
                    )}
                  </div>
                  {staffOpen && (
                    <div className="px-5 pb-4">
                      {selectedClient.subEmployees.length > 0 ? (
                        <div className="space-y-2">
                          {selectedClient.subEmployees.map((emp) => (
                            <div key={emp.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 hover:bg-blue-50 transition-colors">
                              <Avatar photo={emp.photo} name={emp.name} size="md" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm flex items-center gap-1.5">{emp.name}
                                  {emp.trainingInvoiceId ? (
                                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  ) : (
                                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  )}
                                </p>
                                <p className="text-xs text-gray-500">{emp.role}</p>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                                  <span>{emp.email}</span><span>{emp.phone}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEditForm('employee', emp)} className="text-gray-400 hover:text-brand-600 transition-colors p-1.5 rounded-lg hover:bg-white" title="Edit"><EditIcon /></button>
                                <button onClick={() => setConfirmDelete({ type: 'employee', id: selectedClient.id, id2: emp.id, label: 'Remove this staff member?' })} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-white" title="Remove"><TrashIcon size="w-4 h-4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No staff members added yet</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* INVOICES BOX */}
              <div className="card !p-0">
                <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Invoices
                      {clientInvoices.length > 0 && <span className="text-xs text-gray-400 font-normal">({clientInvoices.length})</span>}
                    </h3>
                    <div className="flex items-center gap-2">
                      {invoicesSource === 'mock' && <span className="text-[10px] text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">Demo data</span>}
                      <span className="text-[10px] text-purple-500">Click an invoice to create Stations</span>
                    </div>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {invoicesLoading ? (
                    <div className="p-6 text-center">
                      <div className="animate-spin w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-2"></div>
                      <p className="text-sm text-gray-400">Loading invoices...</p>
                    </div>
                  ) : clientInvoices.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left">
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Items</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientInvoices.map((inv) => (
                          <tr key={inv.id} onClick={() => openInvoicePreview(inv)} className="border-b border-gray-50 hover:bg-purple-50 transition-colors cursor-pointer group">
                            <td className="px-4 py-3 font-medium group-hover:text-purple-700">{inv.invoiceNumber}</td>
                            <td className="px-4 py-3 text-gray-500">{formatDate(inv.date)}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{inv.items?.length || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-center">
                      <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm text-gray-400">No invoices found for this client</p>
                    </div>
                  )}
                </div>
                {clientInvoices.length > 0 && (
                  <div className="p-3 border-t border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-500 text-center">{clientInvoices.length} invoice{clientInvoices.length !== 1 ? 's' : ''}</p>
                  </div>
                )}
              </div>

              {/* STATIONS BOX */}
              <div className="card !p-0">
                <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white">
                  <button onClick={() => setStationsOpen(!stationsOpen)} className="w-full flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      Stations
                      {clientStations.length > 0 && <span className="text-xs text-gray-400 font-normal">({clientStations.length})</span>}
                    </h3>
                    <ChevronIcon open={stationsOpen} />
                  </button>
                </div>
                {stationsOpen && (
                  <div>
                    {clientStations.length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {clientStations.map((station) => (
                          <div key={station.id} className="p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {editingStationId === station.id ? (
                                    <input
                                      autoFocus
                                      value={editingStationName}
                                      onChange={(e) => setEditingStationName(e.target.value)}
                                      onBlur={() => handleRenameStation(station.id, editingStationName)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRenameStation(station.id, editingStationName);
                                        if (e.key === 'Escape') setEditingStationId(null);
                                      }}
                                      className="font-medium text-sm border border-purple-300 rounded px-2 py-0.5 focus:ring-purple-500 focus:border-purple-500 w-48"
                                    />
                                  ) : (
                                    <p
                                      className="font-medium text-sm cursor-pointer hover:text-purple-600 transition-colors"
                                      onClick={(e) => { e.stopPropagation(); setEditingStationId(station.id); setEditingStationName(station.name); }}
                                      title="Click to rename"
                                    >
                                      {station.name}
                                    </p>
                                  )}
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${stationStatusColor(station.status)}`}>
                                    {stationStatusLabel(station.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">From invoice {station.invoiceNumber} — {formatDate(station.createdAt)}</p>
                                {station.description && (
                                  <p className="text-xs text-gray-500 mt-1">{station.description}</p>
                                )}
                              </div>
                              <button onClick={() => setConfirmDelete({ type: 'station', id: station.id, label: 'Delete this station?' })} className="text-gray-300 hover:text-red-500 transition-colors p-1 ml-3" title="Delete station">
                                <TrashIcon size="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <p className="text-sm text-gray-400">No stations created yet</p>
                        <p className="text-xs text-gray-400 mt-1">Click an invoice above to select line items and create stations</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <p className="text-gray-400 text-sm">Select a client from Enrolment to manage</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* INVOICE PREVIEW MODAL */}
      {previewInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Invoice {previewInvoice.invoiceNumber}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">{previewInvoice.clientName}</p>
                </div>
                <button onClick={() => setPreviewInvoice(null)} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-6 mt-3 text-sm">
                <div><span className="text-gray-400">Date:</span> <span className="font-medium">{formatDate(previewInvoice.date)}</span></div>
                <div><span className="text-gray-400">Due:</span> <span className="font-medium">{formatDate(previewInvoice.dueDate)}</span></div>
                <div><span className="text-gray-400">Items:</span> <span className="font-medium">{previewInvoice.items?.length || 0}</span></div>
              </div>
            </div>

            {/* Line Items */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Line Items</h3>
                <p className="text-xs text-gray-400 mt-1">Select the items you want to assign to a Station</p>
              </div>

              {/* Column headers */}
              <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-2">
                <div className="w-6" />
                <div className="w-24">Model</div>
                <div className="flex-1">Description</div>
                <div className="w-20 text-center">Stations Created</div>
                <div className="w-20 text-center">Stations Available</div>
              </div>

              <div className="space-y-2">
                {previewInvoice.items.map((item, index) => {
                  // Count stations already created for this specific line item
                  const stationsForItem = clientStations.filter(s =>
                    s.invoiceId === previewInvoice.id &&
                    s.items.some(si => si.description === item.description)
                  ).length;
                  const available = Math.max(0, item.quantity - stationsForItem);

                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        selectedItems.has(index)
                          ? 'border-purple-400 bg-purple-50'
                          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(index)}
                          onChange={() => toggleItem(index)}
                          className="w-4 h-4 mx-2 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                        />
                        <div className="w-24">
                          <span className="text-xs text-gray-500">{item.model || '—'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.description}</p>
                        </div>
                        <div className="w-20 text-center">
                          <span className={`text-xs font-medium ${stationsForItem > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                            {stationsForItem}
                          </span>
                        </div>
                        <div className="w-20 text-center">
                          <span className={`text-xs font-medium ${available > 0 ? 'text-purple-600' : 'text-gray-300'}`}>
                            {available}
                          </span>
                        </div>
                      </label>
                      {/* Quantity selector for multi-unit items */}
                      {selectedItems.has(index) && available > 1 && (
                        <div className="mt-3 ml-8 flex items-center gap-3 bg-white rounded-lg p-2 border border-purple-200">
                          <span className="text-xs text-gray-500">How many stations for this item?</span>
                          <select
                            value={itemQuantities[index] || 1}
                            onChange={(e) => setItemQuantities(prev => ({ ...prev, [index]: parseInt(e.target.value) }))}
                            className="text-sm border border-gray-200 rounded px-2 py-1 focus:ring-purple-500 focus:border-purple-500"
                          >
                            {Array.from({ length: available }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{n} station{n > 1 ? 's' : ''}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Create Station Footer */}
            <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
              {selectedItems.size > 0 ? (
                <div className="space-y-3">
                  {/* Choose: add to existing or create new */}
                  {clientStations.length > 0 && (
                    <div className="flex items-center gap-4 mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="stationMode"
                          checked={stationMode === 'existing'}
                          onChange={() => setStationMode('existing')}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700">Add to existing station</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="stationMode"
                          checked={stationMode === 'new'}
                          onChange={() => setStationMode('new')}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700">Create new station</span>
                      </label>
                    </div>
                  )}

                  {/* Existing station selector */}
                  {stationMode === 'existing' && clientStations.length > 0 && (
                    <select
                      value={selectedExistingStationId || ''}
                      onChange={(e) => setSelectedExistingStationId(e.target.value)}
                      className="input-field text-sm !py-2 w-full"
                    >
                      {clientStations.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.items.length} item{s.items.length !== 1 ? 's' : ''})</option>
                      ))}
                    </select>
                  )}

                  {/* New station name */}
                  {stationMode === 'new' && (
                    <input
                      type="text"
                      placeholder={`Station name (default: Station — ${previewInvoice.invoiceNumber})`}
                      value={stationName}
                      onChange={(e) => setStationName(e.target.value)}
                      className="input-field text-sm !py-2 w-full"
                    />
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">{selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected</span>
                    <button
                      onClick={handleCreateStation}
                      className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {stationMode === 'existing' ? 'Add to Station' : 'Create Station'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center">Select line items above to create a Station</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {confirmDelete && (
        <HoldToConfirm
          label={confirmDelete.label}
          onConfirm={executeConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ADD / EDIT CONTACT MODAL */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {editingContactId
                  ? (contactFormType === 'responsible' ? 'Edit Main Contact' : 'Edit Staff Member')
                  : (contactFormType === 'responsible' ? 'Set Main Contact' : 'Add Staff Member')}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {contactFormType === 'responsible' ? 'The main contact person for this client' : 'A staff member at this client\'s company'}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar photo={contactForm.photo} name={contactForm.name || '?'} size="xl" editable onPhotoChange={(base64) => setContactForm({ ...contactForm, photo: base64 })} />
                <div>
                  <p className="text-sm font-medium text-gray-700">Profile Photo</p>
                  <p className="text-xs text-gray-500 mt-0.5">Click the avatar to upload a photo</p>
                  <p className="text-xs text-gray-400">Or leave empty for auto-generated initials</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input className="input-field" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} placeholder="e.g. Pierre Martin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input className="input-field" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="e.g. pierre@company.ca" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input className="input-field" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="e.g. 514-555-0000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <input className="input-field" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} placeholder="e.g. IT Manager, Receptionist, Owner" />
              </div>

              {/* Training Section */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-800 mb-3">Training</p>
                <div className="space-y-3">
                  {/* Training invoices list */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Training Invoices</label>
                    {/* Existing invoices */}
                    {(() => {
                      const invoices = (contactForm.trainingInvoiceId || '').split(',').map(s => s.trim()).filter(Boolean);
                      return invoices.length > 0 ? (
                        <div className="space-y-1 mb-2">
                          {invoices.map((inv, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5 text-sm">
                              <span className="text-blue-700 font-medium">Invoice #{inv}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = invoices.filter((_, i) => i !== idx).join(', ');
                                  setContactForm({ ...contactForm, trainingInvoiceId: updated || null });
                                }}
                                className="text-red-400 hover:text-red-600 text-xs"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    {/* Add new invoice */}
                    <div className="flex gap-2">
                      <input
                        id="training-invoice-input"
                        className="input-field text-sm flex-1"
                        placeholder="Enter QB invoice #"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const input = e.currentTarget;
                            const val = input.value.trim();
                            if (!val) return;
                            const existing = (contactForm.trainingInvoiceId || '').split(',').map(s => s.trim()).filter(Boolean);
                            if (!existing.includes(val)) {
                              const updated = [...existing, val].join(', ');
                              setContactForm({ ...contactForm, trainingInvoiceId: updated });
                            }
                            input.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('training-invoice-input') as HTMLInputElement;
                          const val = input?.value.trim();
                          if (!val) return;
                          const existing = (contactForm.trainingInvoiceId || '').split(',').map(s => s.trim()).filter(Boolean);
                          if (!existing.includes(val)) {
                            const updated = [...existing, val].join(', ');
                            setContactForm({ ...contactForm, trainingInvoiceId: updated });
                          }
                          if (input) input.value = '';
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 whitespace-nowrap"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {/* QR Code for self-edit profile */}
                  {editingContactId && contactForm.email && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Profile QR Code</label>
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                            `${typeof window !== 'undefined' ? window.location.origin : ''}/profile/${editingContactId}`
                          )}`}
                          alt="QR Code"
                          className="w-24 h-24 border border-gray-200 rounded-lg"
                        />
                        <div className="flex flex-col gap-2">
                          <div className="text-xs text-gray-500">
                            <p>Scan to open self-edit profile page.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const profileUrl = `${window.location.origin}/profile/${editingContactId}`;
                              const subject = encodeURIComponent('Your Profile Link - Atelier DSM');
                              const body = encodeURIComponent(`Hi ${contactForm.name},\n\nHere is your profile link where you can update your information:\n${profileUrl}\n\nBest regards,\nAtelier DSM`);
                              window.open(`mailto:${contactForm.email}?subject=${subject}&body=${body}`, '_blank');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Send to {contactForm.name.split(' ')[0] || 'contact'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {editingContactId && contactForm.email && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Password</p>
                      <p className="text-xs text-gray-400">Send a password reset email to this contact</p>
                    </div>
                    <button type="button" onClick={() => handleResetPassword(contactForm.email, contactForm.name)}
                      disabled={resetSending || (!!resetCountdowns[contactForm.email] && resetCountdowns[contactForm.email] > 0)}
                      className="text-xs bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      {resetSending ? 'Sending...' : resetCountdowns[contactForm.email] && resetCountdowns[contactForm.email] > 0 ? `Wait ${resetCountdowns[contactForm.email]}s` : 'Reset Password'}
                    </button>
                  </div>
                  {resetMessage && <p className={`text-xs mt-2 ${resetMessage.includes('sent') ? 'text-green-600' : 'text-yellow-600'}`}>{resetMessage}</p>}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setShowContactForm(false); setEditingContactId(null); }} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveContact} disabled={!contactForm.name.trim() || !contactForm.email.trim()} className="btn-primary disabled:opacity-50">
                {editingContactId ? 'Save Changes' : (contactFormType === 'responsible' ? 'Set as Main Contact' : 'Add Staff Member')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
