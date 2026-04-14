'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { type QBClient, type ManagedClient, type ContactPerson } from '@/lib/mock-data';
import { useLanguage } from '@/lib/LanguageContext';
import Avatar from '@/components/Avatar';
import StreetView from '@/components/StreetView';
import PageHeader from '@/components/PageHeader';

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    fill="none" viewBox="0 0 24 24" stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

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
  const { t } = useLanguage();
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
  const [contactFormType, setContactFormType] = useState<'maincontact' | 'staff'>('maincontact');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<Omit<ContactPerson, 'id'>>({
    photo: null, name: '', email: '', phone: '', role: '',
  });

  const [contactError, setContactError] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');
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

  // Training Agenda state
  const [trainingAgendaOpen, setTrainingAgendaOpen] = useState(true);
  const [clientTrainings, setClientTrainings] = useState<any[]>([]);
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingTemplates, setTrainingTemplates] = useState<{ id: string; name: string; description: string }[]>([]);
  const [trainingForm, setTrainingForm] = useState({
    title: '', description: '', date: '', duration: '', templateId: '',
  });
  const [trainingAttendees, setTrainingAttendees] = useState<{ contactId: string; name: string; email: string }[]>([]);
  const [trainingFiles, setTrainingFiles] = useState<{ name: string; fileType: string; fileData: string; fileSize: number }[]>([]);
  const [trainingSaving, setTrainingSaving] = useState(false);
  const [trainingDetail, setTrainingDetail] = useState<any | null>(null);

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
      setResetMessage(data.emailSent ? `${t('clients', 'resetSent')} ${email}` : (data.message || 'Reset link generated (email not configured)'));
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

  // Load training templates once
  useEffect(() => {
    fetch('/api/training/templates').then(r => r.json()).then(data => {
      setTrainingTemplates(data.templates || []);
    }).catch(() => {});
  }, []);

  // Load training events for selected client
  useEffect(() => {
    if (!selectedClientId) { setClientTrainings([]); return; }
    fetch(`/api/training/events?clientId=${selectedClientId}`).then(r => r.json()).then(data => {
      setClientTrainings(data.events || []);
    }).catch(() => setClientTrainings([]));
  }, [selectedClientId]);

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
    fetch(`/api/stations?clientId=${selectedClientId}`).then(r => r.json()).then(data => {
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

  const openContactForm = (type: 'maincontact' | 'staff') => {
    setContactFormType(type); setEditingContactId(null);
    setContactForm({ photo: null, name: '', email: '', phone: '', role: '' });
    setContactError(null); setReassignTargetId(''); setShowContactForm(true);
  };

  const openEditForm = (type: 'maincontact' | 'staff', contact: ContactPerson) => {
    setContactFormType(type); setEditingContactId(contact.id);
    setContactForm({ photo: contact.photo, name: contact.name, email: contact.email, phone: contact.phone, role: contact.role });
    setContactError(null); setResetMessage(null); setReassignTargetId(''); setShowContactForm(true);
  };

  const handleSaveContact = async () => {
    if (!selectedClient || !contactForm.name.trim() || !contactForm.email.trim()) return;
    setContactError(null);
    if (editingContactId) {
      const reassigning = reassignTargetId && reassignTargetId !== selectedClient.id;
      try {
        const res = await fetch(`/api/managed-clients/${selectedClient.id}/contacts/${editingContactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reassigning ? { ...contactForm, managedClientId: reassignTargetId } : contactForm),
        });
        const data = await res.json();
        if (res.status === 409) { setContactError(data.error); return; }
        if (data.contact) {
          const updatedContact = { ...data.contact, id: editingContactId };
          if (reassigning) {
            // Remove from source client, add to target client.
            setManagedClients(managedClients.map((mc) => {
              if (mc.id === selectedClient.id) {
                if (contactFormType === 'maincontact' && mc.responsiblePerson?.id === editingContactId) {
                  return { ...mc, responsiblePerson: null };
                }
                return { ...mc, subEmployees: mc.subEmployees.filter(e => e.id !== editingContactId) };
              }
              if (mc.id === reassignTargetId) {
                if (contactFormType === 'maincontact') return { ...mc, responsiblePerson: updatedContact };
                return { ...mc, subEmployees: [...mc.subEmployees, updatedContact] };
              }
              return mc;
            }));
            setSelectedClientId(reassignTargetId);
          } else {
            setManagedClients(managedClients.map((mc) => {
              if (mc.id !== selectedClient.id) return mc;
              if (contactFormType === 'maincontact' && mc.responsiblePerson?.id === editingContactId) return { ...mc, responsiblePerson: updatedContact };
              return { ...mc, subEmployees: mc.subEmployees.map(e => e.id === editingContactId ? updatedContact : e) };
            }));
          }
        }
      } catch (error) { console.error('Error updating contact:', error); }
      setShowContactForm(false); setEditingContactId(null); setReassignTargetId('');
    } else {
      try {
        const res = await fetch(`/api/managed-clients/${selectedClient.id}/contacts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...contactForm, type: contactFormType }),
        });
        const data = await res.json();
        if (res.status === 409) { setContactError(data.error); return; }
        if (data.contact) {
          setManagedClients(managedClients.map((mc) => {
            if (mc.id !== selectedClient.id) return mc;
            if (contactFormType === 'maincontact') return { ...mc, responsiblePerson: data.contact };
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
          const raw = await fetch(`/api/stations/${selectedExistingStationId}`).then(r => r.json());
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
        fetch(`/api/stations/${selectedExistingStationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        }).catch(() => {});
      }
    } else {
      // Create new station via /api/stations
      const name = stationName.trim() || `Station — ${previewInvoice.invoiceNumber}`;
      const notes = JSON.stringify({ invoiceId: previewInvoice.id, invoiceNumber: previewInvoice.invoiceNumber, items });

      try {
        const res = await fetch('/api/stations', {
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
    fetch(`/api/stations/${stationId}`, { method: 'DELETE' }).catch(() => {});
  };

  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editingStationName, setEditingStationName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; id2?: string; label: string } | null>(null);

  const handleDeleteTraining = async (trainingId: string) => {
    try {
      await fetch(`/api/training/events/${trainingId}`, { method: 'DELETE' });
      setClientTrainings(prev => prev.filter(t => t.id !== trainingId));
      if (trainingDetail?.id === trainingId) setTrainingDetail(null);
    } catch (err) { console.error('Failed to delete training:', err); }
  };

  const executeConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    switch (confirmDelete.type) {
      case 'station': handleDeleteStation(confirmDelete.id); break;
      case 'client': handleRemoveClient(confirmDelete.id); break;
      case 'maincontact': handleRemoveResponsible(confirmDelete.id); break;
      case 'staff': handleRemoveEmployee(confirmDelete.id, confirmDelete.id2 || ''); break;
      case 'training': handleDeleteTraining(confirmDelete.id); break;
    }
    setConfirmDelete(null);
  }, [confirmDelete]);

  const handleRenameStation = (stationId: string, newName: string) => {
    if (!newName.trim()) return;
    setClientStations(prev => prev.map(s => s.id === stationId ? { ...s, name: newName.trim() } : s));
    setEditingStationId(null);
    fetch(`/api/stations/${stationId}`, {
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

  const handleCreateTraining = async () => {
    if (!selectedClientId || !trainingForm.title.trim() || !trainingForm.date) return;
    setTrainingSaving(true);
    try {
      const res = await fetch('/api/training/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trainingForm.title,
          description: trainingForm.description || null,
          date: trainingForm.date,
          duration: trainingForm.duration ? parseInt(trainingForm.duration) : null,
          templateId: trainingForm.templateId || null,
          managedClientId: selectedClientId,
          attendees: trainingAttendees,
        }),
      });
      const data = await res.json();
      if (data.event) {
        // Upload files if any
        if (trainingFiles.length > 0) {
          await Promise.all(trainingFiles.map(f =>
            fetch('/api/training/files', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...f, eventId: data.event.id }),
            })
          ));
        }
        // Mark attendees as trainingCompleted
        if (trainingAttendees.length > 0) {
          await Promise.all(trainingAttendees.map(a =>
            fetch(`/api/managed-clients/${selectedClientId}/contacts/${a.contactId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trainingCompleted: true }),
            })
          ));
          // Refresh managed clients to update indicators
          const mcRes = await fetch('/api/managed-clients');
          const mcData = await mcRes.json();
          if (mcData.clients) setManagedClients(mcData.clients);
        }
        // Reload trainings
        const evRes = await fetch(`/api/training/events?clientId=${selectedClientId}`);
        const evData = await evRes.json();
        setClientTrainings(evData.events || []);
        // Reset form
        setShowTrainingForm(false);
        setTrainingForm({ title: '', description: '', date: '', duration: '', templateId: '' });
        setTrainingAttendees([]);
        setTrainingFiles([]);
      }
    } catch (err) {
      console.error('Failed to create training:', err);
    }
    setTrainingSaving(false);
  };

  const handleTrainingFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const ext = file.name.split('.').pop()?.toLowerCase() || 'other';
        let fileType = 'other';
        if (['pdf'].includes(ext)) fileType = 'pdf';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'image';
        else if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) fileType = 'video';
        setTrainingFiles(prev => [...prev, { name: file.name, fileType, fileData: base64, fileSize: file.size }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

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
      <PageHeader title={t('clients', 'title')} subtitle={t('clients', 'subtitle')} />

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
                  <h2 className="font-semibold text-sm">{t('clients', 'qbClients')}</h2>
                </div>
                {(!qbConnected || (qbConnected && dataSource === 'mock')) && !qbLoading && (
                  <button onClick={handleConnectQB} className="text-[10px] bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded transition-colors">
                    {qbConnected && dataSource === 'mock' ? t('clients', 'reconnect') : t('clients', 'connect')}
                  </button>
                )}
              </div>
              {!credentialsConfigured && (
                <p className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded mb-2">
                  {t('clients', 'credentialsMissing')}
                </p>
              )}
              {connectError && (
                <p className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded mb-2">{connectError}</p>
              )}
              {dataSource === 'mock' && credentialsConfigured && (
                <p className="text-[10px] text-yellow-600 bg-yellow-50 px-2 py-1 rounded mb-2">
                  {qbConnected ? t('clients', 'sessionExpired') : t('clients', 'demoData')}
                </p>
              )}
              {dataSource === 'quickbooks' && (
                <p className="text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded mb-2">{t('clients', 'connected')}</p>
              )}
              <input
                type="text"
                placeholder={t('clients', 'searchQB')}
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
                      <button onClick={() => handleAddClient(client)} className="flex-shrink-0 ml-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">{t('common', 'add')}</button>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-sm text-gray-400">{t('clients', 'noMatchingClients')}</div>
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
                {t('clients', 'enrolment')}
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
                  <p className="text-sm text-gray-400">{t('clients', 'noClientsEnrolled')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('clients', 'searchQBAbove')}</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                {managedClients.length} {t('clients', 'clientsEnrolled')}
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
                    <button onClick={() => setConfirmDelete({ type: 'client', id: selectedClient.id, label: t('clients', 'removeClient') })} className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">{t('common', 'remove')}</button>
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
                      <span className="text-sm font-medium text-gray-700">{t('clients', 'streetView')}</span>
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
                      <span className="text-sm font-semibold text-gray-900">{t('clients', 'mainContact')}</span>
                    </button>
                    {!selectedClient.responsiblePerson && mainContactOpen && (
                      <button onClick={() => openContactForm('maincontact')} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors">+ {t('clients', 'setMainContact')}</button>
                    )}
                  </div>
                  {mainContactOpen && (
                    <div className="px-5 pb-4">
                      {selectedClient.responsiblePerson ? (
                        <div className="flex items-center gap-4 bg-green-50 rounded-xl p-4">
                          <Avatar photo={selectedClient.responsiblePerson.photo} name={selectedClient.responsiblePerson.name} size="lg" />
                          <div className="flex-1">
                            <p className="font-semibold">{selectedClient.responsiblePerson.name}</p>
                            <p className="text-sm text-gray-600">{selectedClient.responsiblePerson.role}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                              <span>{selectedClient.responsiblePerson.email}</span>
                              <span>{selectedClient.responsiblePerson.phone}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-14 flex flex-col items-center gap-1">
                              <span className="text-[9px] uppercase tracking-wider text-gray-400 font-medium leading-none">{t('clients', 'trainingCol')}</span>
                              {selectedClient.responsiblePerson.trainingCompleted ? (
                                <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              )}
                            </div>
                            <div className="w-14 flex flex-col items-center gap-1">
                              <span className="text-[9px] uppercase tracking-wider text-gray-400 font-medium leading-none">{t('clients', 'bookletCol')}</span>
                              {selectedClient.responsiblePerson.trainingPhoto ? (
                                <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditForm('maincontact', selectedClient.responsiblePerson!)} className="text-gray-400 hover:text-brand-600 transition-colors p-1.5 rounded-lg hover:bg-white" title={t('common', 'edit')}><EditIcon /></button>
                            <button onClick={() => setConfirmDelete({ type: 'maincontact', id: selectedClient.id, label: t('clients', 'removeMainContact') })} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-white" title={t('common', 'remove')}><TrashIcon /></button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">{t('clients', 'noMainContact')}</p>
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
                      <span className="text-sm font-semibold text-gray-900">{t('clients', 'staff')}</span>
                      {selectedClient.subEmployees.length > 0 && <span className="text-xs text-gray-400 ml-1">({selectedClient.subEmployees.length})</span>}
                    </button>
                    {staffOpen && (
                      <button onClick={() => openContactForm('staff')} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">+ {t('clients', 'addStaff')}</button>
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
                                <p className="font-medium text-sm">{emp.name}</p>
                                <p className="text-xs text-gray-500">{emp.role}</p>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                                  <span>{emp.email}</span><span>{emp.phone}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="w-14 flex flex-col items-center gap-1">
                                  <span className="text-[9px] uppercase tracking-wider text-gray-400 font-medium leading-none">{t('clients', 'trainingCol')}</span>
                                  {emp.trainingCompleted ? (
                                    <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  ) : (
                                    <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  )}
                                </div>
                                <div className="w-14 flex flex-col items-center gap-1">
                                  <span className="text-[9px] uppercase tracking-wider text-gray-400 font-medium leading-none">{t('clients', 'bookletCol')}</span>
                                  {emp.trainingPhoto ? (
                                    <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  ) : (
                                    <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEditForm('staff', emp)} className="text-gray-400 hover:text-brand-600 transition-colors p-1.5 rounded-lg hover:bg-white" title={t('common', 'edit')}><EditIcon /></button>
                                <button onClick={() => setConfirmDelete({ type: 'staff', id: selectedClient.id, id2: emp.id, label: t('clients', 'removeStaff') })} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-white" title={t('common', 'remove')}><TrashIcon size="w-4 h-4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">{t('clients', 'noStaff')}</p>
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
                      {t('clients', 'invoices')}
                      {clientInvoices.length > 0 && <span className="text-xs text-gray-400 font-normal">({clientInvoices.length})</span>}
                    </h3>
                    <div className="flex items-center gap-2">
                      {invoicesSource === 'mock' && <span className="text-[10px] text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">{t('clients', 'demoData')}</span>}
                      <span className="text-[10px] text-purple-500">{t('clients', 'clickInvoice')}</span>
                    </div>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {invoicesLoading ? (
                    <div className="p-6 text-center">
                      <div className="animate-spin w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-2"></div>
                      <p className="text-sm text-gray-400">{t('clients', 'loadingInvoices')}</p>
                    </div>
                  ) : clientInvoices.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left">
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('clients', 'invoiceNumber')}</th>
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common', 'date')}</th>
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('clients', 'items')}</th>
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
                      <p className="text-sm text-gray-400">{t('clients', 'noInvoices')}</p>
                    </div>
                  )}
                </div>
                {clientInvoices.length > 0 && (
                  <div className="p-3 border-t border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-500 text-center">{clientInvoices.length} {clientInvoices.length === 1 ? 'invoice' : 'invoices'}</p>
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
                      {t('clients', 'stationsSection')}
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
                                <p className="text-xs text-gray-400 mt-0.5">{t('clients', 'fromInvoice')} {station.invoiceNumber} — {formatDate(station.createdAt)}</p>
                                {station.description && (
                                  <p className="text-xs text-gray-500 mt-1">{station.description}</p>
                                )}
                              </div>
                              <button onClick={() => setConfirmDelete({ type: 'station', id: station.id, label: t('clients', 'deleteStation') })} className="text-gray-300 hover:text-red-500 transition-colors p-1 ml-3" title={t('common', 'delete')}>
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
                        <p className="text-sm text-gray-400">{t('clients', 'noStations')}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('clients', 'clickInvoiceStations')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TRAINING AGENDA BOX */}
              <div className="card !p-0">
                <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setTrainingAgendaOpen(!trainingAgendaOpen)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                      <ChevronIcon open={trainingAgendaOpen} />
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {t('clients', 'trainingAgenda')}
                        {clientTrainings.length > 0 && <span className="text-xs text-gray-400 font-normal">({clientTrainings.length})</span>}
                      </h3>
                    </button>
                    {trainingAgendaOpen && (
                      <button
                        onClick={() => { setShowTrainingForm(true); setTrainingDetail(null); setTrainingForm({ title: '', description: '', date: '', duration: '', templateId: '' }); setTrainingAttendees([]); setTrainingFiles([]); }}
                        className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        {t('clients', 'newTraining')}
                      </button>
                    )}
                  </div>
                </div>
                {trainingAgendaOpen && (
                  <div>
                    {clientTrainings.length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {clientTrainings.map((tr: any) => (
                          <div key={tr.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setTrainingDetail(tr)}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{tr.title}</p>
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                    tr.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    tr.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                    'bg-teal-100 text-teal-700'
                                  }`}>
                                    {tr.status}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {formatDate(tr.date)}
                                  {tr.duration && <span> — {tr.duration} min</span>}
                                  {tr.template && <span> — Template: {tr.template.name}</span>}
                                </p>
                                {tr.attendees?.length > 0 && (
                                  <p className="text-xs text-gray-500 mt-1">{tr.attendees.length} attendee{tr.attendees.length !== 1 ? 's' : ''}</p>
                                )}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'training', id: tr.id, label: 'Delete this training?' }); }}
                                className="text-gray-300 hover:text-red-500 transition-colors p-1 ml-2"
                              >
                                <TrashIcon size="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <p className="text-sm text-gray-400">{t('clients', 'noTrainings')}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('clients', 'clickNewTraining')}</p>
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
                <p className="text-gray-400 text-sm">{t('clients', 'selectClient')}</p>
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
                <h3 className="text-sm font-semibold text-gray-700">{t('clients', 'lineItems')}</h3>
                <p className="text-xs text-gray-400 mt-1">{t('clients', 'selectItems')}</p>
              </div>

              {/* Column headers */}
              <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-2">
                <div className="w-6" />
                <div className="w-24">{t('clients', 'model')}</div>
                <div className="flex-1">{t('common', 'description')}</div>
                <div className="w-20 text-center">{t('clients', 'stationsCreated')}</div>
                <div className="w-20 text-center">{t('clients', 'stationsAvailable')}</div>
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
                          <span className="text-xs text-gray-500">{t('clients', 'howManyStations')}</span>
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
                        <span className="text-sm text-gray-700">{t('clients', 'addToExisting')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="stationMode"
                          checked={stationMode === 'new'}
                          onChange={() => setStationMode('new')}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700">{t('clients', 'createNewStation')}</span>
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
                      placeholder={`${t('clients', 'stationNameDefault')} ${previewInvoice.invoiceNumber})`}
                      value={stationName}
                      onChange={(e) => setStationName(e.target.value)}
                      className="input-field text-sm !py-2 w-full"
                    />
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">{selectedItems.size} {t('clients', 'itemsSelected')}</span>
                    <button
                      onClick={handleCreateStation}
                      className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {stationMode === 'existing' ? t('clients', 'addToStation') : t('clients', 'createStation')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center">{t('clients', 'selectLineItems')}</p>
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
                  ? (contactFormType === 'maincontact' ? t('clients', 'editMainContact') : t('clients', 'editStaff'))
                  : (contactFormType === 'maincontact' ? t('clients', 'setMainContact') : t('clients', 'addStaffMember'))}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {contactFormType === 'maincontact' ? t('clients', 'mainContactDesc') : t('clients', 'staffDesc')}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar photo={contactForm.photo} name={contactForm.name || '?'} size="xl" editable onPhotoChange={(base64) => setContactForm({ ...contactForm, photo: base64 })} />
                <div>
                  <p className="text-sm font-medium text-gray-700">{t('clients', 'profilePhoto')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t('clients', 'clickAvatar')}</p>
                  <p className="text-xs text-gray-400">{t('clients', 'leaveEmptyInitials')}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'fullName')}</label>
                <input className="input-field" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} placeholder="e.g. Pierre Martin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'emailRequired')}</label>
                <input className="input-field" type="email" value={contactForm.email} onChange={(e) => { setContactForm({ ...contactForm, email: e.target.value }); setContactError(null); }} placeholder="e.g. pierre@company.ca" />
                {contactError && <p className="text-xs text-red-600 mt-1">{contactError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'phoneLabel')}</label>
                <input className="input-field" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="e.g. 514-555-0000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'roleLabel')}</label>
                <input className="input-field" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} placeholder="e.g. IT Manager, Receptionist, Owner" />
              </div>

              {/* QR Code for self-edit profile */}
              {editingContactId && contactForm.email && (
                <div className="pt-3 border-t border-gray-100">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('clients', 'profileQRCode')}</label>
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
                        <p>{t('clients', 'scanToEdit')}</p>
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
                        {t('clients', 'sendTo')} {contactForm.name.split(' ')[0] || 'contact'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {editingContactId && managedClients.length > 1 && (
                <div className="pt-3 border-t border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('clients', 'reassignSection')}
                  </label>
                  <p className="text-xs text-gray-400 mb-2">{t('clients', 'reassignDesc')}</p>
                  <select
                    className="input-field"
                    value={reassignTargetId}
                    onChange={(e) => setReassignTargetId(e.target.value)}
                  >
                    <option value="">{t('clients', 'reassignKeep')}</option>
                    {managedClients
                      .filter((mc) => mc.id !== selectedClient?.id)
                      .map((mc) => (
                        <option key={mc.id} value={mc.id}>
                          {mc.qbClient.companyName}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {editingContactId && contactForm.email && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{t('clients', 'passwordSection')}</p>
                      <p className="text-xs text-gray-400">{t('clients', 'sendResetEmail')}</p>
                    </div>
                    <button type="button" onClick={() => handleResetPassword(contactForm.email, contactForm.name)}
                      disabled={resetSending || (!!resetCountdowns[contactForm.email] && resetCountdowns[contactForm.email] > 0)}
                      className="text-xs bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      {resetSending ? t('clients', 'resetSending') : resetCountdowns[contactForm.email] && resetCountdowns[contactForm.email] > 0 ? `${t('clients', 'waitSeconds')} ${resetCountdowns[contactForm.email]}s` : t('clients', 'resetPassword')}
                    </button>
                  </div>
                  {resetMessage && <p className={`text-xs mt-2 ${resetMessage.includes('sent') ? 'text-green-600' : 'text-yellow-600'}`}>{resetMessage}</p>}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setShowContactForm(false); setEditingContactId(null); setReassignTargetId(''); }} className="btn-secondary">{t('common', 'cancel')}</button>
              <button onClick={handleSaveContact} disabled={!contactForm.name.trim() || !contactForm.email.trim()} className="btn-primary disabled:opacity-50">
                {editingContactId ? t('clients', 'saveChanges') : (contactFormType === 'maincontact' ? t('clients', 'setAsMainContact') : t('clients', 'addStaffMember'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW TRAINING MODAL */}
      {showTrainingForm && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    {t('clients', 'newTraining')}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">{t('clients', 'forCompany')} {selectedClient.qbClient.companyName}</p>
                </div>
                <button onClick={() => setShowTrainingForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Template link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'trainingTemplate')}</label>
                {trainingTemplates.length > 0 ? (
                  <select
                    value={trainingForm.templateId}
                    onChange={(e) => {
                      const tpl = trainingTemplates.find(t => t.id === e.target.value);
                      setTrainingForm({ ...trainingForm, templateId: e.target.value, title: tpl ? tpl.name : trainingForm.title, description: tpl ? tpl.description : trainingForm.description });
                    }}
                    className="input-field text-sm"
                  >
                    <option value="">{t('clients', 'noTemplate')}</option>
                    {trainingTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <div className="bg-yellow-50 text-yellow-700 text-xs rounded-lg px-3 py-2">
                    {t('clients', 'noTemplatesWarning')}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'titleRequired')}</label>
                <input className="input-field" value={trainingForm.title} onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })} placeholder="e.g. Laser Safety Training" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common', 'description')}</label>
                <textarea className="input-field text-sm" rows={2} value={trainingForm.description} onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })} placeholder="Optional details..." />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'dateRequired')}</label>
                  <input type="datetime-local" className="input-field text-sm" value={trainingForm.date} onChange={(e) => setTrainingForm({ ...trainingForm, date: e.target.value })} />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'durationMin')}</label>
                  <input type="number" className="input-field text-sm" value={trainingForm.duration} onChange={(e) => setTrainingForm({ ...trainingForm, duration: e.target.value })} placeholder="60" />
                </div>
              </div>

              {/* Attendees — pick from client's staff */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'attendees')}</label>
                <p className="text-xs text-gray-400 mb-2">{t('clients', 'addStaffFrom')} {selectedClient.qbClient.companyName}</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {/* Main contact */}
                  {selectedClient.responsiblePerson && (
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar photo={selectedClient.responsiblePerson.photo} name={selectedClient.responsiblePerson.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{selectedClient.responsiblePerson.name}</p>
                          <p className="text-xs text-gray-400">{selectedClient.responsiblePerson.role || 'Main Contact'}</p>
                        </div>
                      </div>
                      {trainingAttendees.some(a => a.contactId === selectedClient.responsiblePerson!.id) ? (
                        <button onClick={() => setTrainingAttendees(prev => prev.filter(a => a.contactId !== selectedClient.responsiblePerson!.id))} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                      ) : (
                        <button onClick={() => setTrainingAttendees(prev => [...prev, { contactId: selectedClient.responsiblePerson!.id, name: selectedClient.responsiblePerson!.name, email: selectedClient.responsiblePerson!.email }])} className="text-xs text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 font-medium">+ Add</button>
                      )}
                    </div>
                  )}
                  {/* Staff employees */}
                  {selectedClient.subEmployees.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar photo={emp.photo} name={emp.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{emp.name}</p>
                          <p className="text-xs text-gray-400">{emp.role || 'Staff'}</p>
                        </div>
                      </div>
                      {trainingAttendees.some(a => a.contactId === emp.id) ? (
                        <button onClick={() => setTrainingAttendees(prev => prev.filter(a => a.contactId !== emp.id))} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                      ) : (
                        <button onClick={() => setTrainingAttendees(prev => [...prev, { contactId: emp.id, name: emp.name, email: emp.email }])} className="text-xs text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 font-medium">+ Add</button>
                      )}
                    </div>
                  ))}
                  {!selectedClient.responsiblePerson && selectedClient.subEmployees.length === 0 && (
                    <p className="text-xs text-gray-400 italic py-2">{t('clients', 'noContactsToAdd')}</p>
                  )}
                </div>
                {trainingAttendees.length > 0 && (
                  <p className="text-xs text-teal-600 mt-2 font-medium">{trainingAttendees.length} {t('clients', 'attendeesSelected')}</p>
                )}
              </div>

              {/* File upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients', 'filesSection')}</label>
                <p className="text-xs text-gray-400 mb-2">{t('clients', 'attachBooklet')}</p>
                {trainingFiles.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {trainingFiles.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          <span className="text-blue-700 font-medium truncate max-w-[200px]">{f.name}</span>
                          <span className="text-blue-400 text-xs">{(f.fileSize / 1024).toFixed(0)} KB</span>
                        </div>
                        <button type="button" onClick={() => setTrainingFiles(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {t('clients', 'uploadFiles')}
                  <input type="file" multiple className="hidden" onChange={handleTrainingFileUpload} />
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowTrainingForm(false)} className="btn-secondary">{t('common', 'cancel')}</button>
              <button
                onClick={handleCreateTraining}
                disabled={!trainingForm.title.trim() || !trainingForm.date || trainingSaving}
                className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {trainingSaving ? t('clients', 'creating') : t('clients', 'createTraining')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRAINING DETAIL MODAL */}
      {trainingDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{trainingDetail.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatDate(trainingDetail.date)}
                    {trainingDetail.duration && <span> — {trainingDetail.duration} min</span>}
                  </p>
                </div>
                <button onClick={() => setTrainingDetail(null)} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  trainingDetail.status === 'completed' ? 'bg-green-100 text-green-700' :
                  trainingDetail.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                  'bg-teal-100 text-teal-700'
                }`}>{trainingDetail.status}</span>
                {trainingDetail.template && (
                  <span className="text-xs text-gray-500">Template: {trainingDetail.template.name}</span>
                )}
              </div>
              {trainingDetail.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-gray-700">{trainingDetail.description}</p>
                </div>
              )}
              {trainingDetail.attendees?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">{t('clients', 'attendees')} ({trainingDetail.attendees.length})</p>
                  <div className="space-y-1">
                    {trainingDetail.attendees.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                        <Avatar photo={null} name={a.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-gray-400">{a.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {trainingDetail.files?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">{t('clients', 'filesSection')} ({trainingDetail.files.length})</p>
                  <div className="space-y-1">
                    {trainingDetail.files.map((f: any) => (
                      <div key={f.id} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5 text-sm">
                        <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        <span className="text-blue-700 font-medium">{f.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Mark as completed / cancelled */}
              {trainingDetail.status === 'scheduled' && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={async () => {
                      await fetch(`/api/training/events/${trainingDetail.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'completed' }),
                      });
                      setClientTrainings(prev => prev.map(t => t.id === trainingDetail.id ? { ...t, status: 'completed' } : t));
                      setTrainingDetail({ ...trainingDetail, status: 'completed' });
                    }}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >{t('clients', 'markComplete')}</button>
                  <button
                    onClick={async () => {
                      await fetch(`/api/training/events/${trainingDetail.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'cancelled' }),
                      });
                      setClientTrainings(prev => prev.map(t => t.id === trainingDetail.id ? { ...t, status: 'cancelled' } : t));
                      setTrainingDetail({ ...trainingDetail, status: 'cancelled' });
                    }}
                    className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg transition-colors"
                  >{t('clients', 'deleteTraining')}</button>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end flex-shrink-0">
              <button onClick={() => setTrainingDetail(null)} className="btn-secondary text-sm">{t('common', 'close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
