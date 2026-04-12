'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { type QBClient, type ManagedClient, type ContactPerson } from '@/lib/mock-data';
import Avatar from '@/components/Avatar';
import StreetView from '@/components/StreetView';

export default function AdminClientsPage() {
  // QuickBooks clients (left panel - import list)
  const [qbClients, setQbClients] = useState<QBClient[]>([]);
  const [qbSearch, setQbSearch] = useState('');
  const [qbConnected, setQbConnected] = useState(false);
  const [qbLoading, setQbLoading] = useState(true);
  const [dataSource, setDataSource] = useState<string>('');
  const [credentialsConfigured, setCredentialsConfigured] = useState(true);
  const [connectError, setConnectError] = useState<string | null>(null);

  // My managed clients (middle panel) — loaded from database API
  const [managedClients, setManagedClients] = useState<ManagedClient[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Currently selected managed client for detail view
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Contact form state
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactFormType, setContactFormType] = useState<'responsible' | 'employee'>('responsible');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<Omit<ContactPerson, 'id'>>({
    photo: null,
    name: '',
    email: '',
    phone: '',
    role: '',
  });

  // Reset password lockout state: maps email -> timestamp when lockout expires
  const [resetLockouts, setResetLockouts] = useState<Record<string, number>>({});
  const [resetCountdowns, setResetCountdowns] = useState<Record<string, number>>({});
  const [resetSending, setResetSending] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown timer for reset lockouts
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      const now = Date.now();
      setResetCountdowns((prev) => {
        const updated: Record<string, number> = {};
        let hasActive = false;
        for (const [email, expiry] of Object.entries(resetLockouts)) {
          const remaining = Math.ceil((expiry - now) / 1000);
          if (remaining > 0) {
            updated[email] = remaining;
            hasActive = true;
          }
        }
        return hasActive ? updated : {};
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [resetLockouts]);

  // Handle reset password
  const handleResetPassword = async (email: string, name: string) => {
    if (resetLockouts[email] && Date.now() < resetLockouts[email]) return;

    setResetSending(true);
    setResetMessage(null);

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });

      const data = await response.json();

      if (data.emailSent) {
        setResetMessage(`Reset email sent to ${email}`);
      } else {
        setResetMessage(data.message || 'Reset link generated (email not configured)');
      }

      // Set 120-second lockout
      setResetLockouts((prev) => ({
        ...prev,
        [email]: Date.now() + 120000,
      }));
    } catch {
      setResetMessage('Failed to send reset email');
    }

    setResetSending(false);
  };

  // Load managed clients from DATABASE on mount
  useEffect(() => {
    fetch('/api/managed-clients')
      .then((res) => res.json())
      .then((data) => {
        if (data.clients) {
          setManagedClients(data.clients);
        }
        setHasLoaded(true);
      })
      .catch(() => setHasLoaded(true));
  }, []);

  // Load QuickBooks clients from API on mount
  useEffect(() => {
    // Check QB connection status and credentials
    fetch('/api/quickbooks/status')
      .then(res => res.json())
      .then(data => {
        setQbConnected(data.connected);
        setCredentialsConfigured(data.credentialsConfigured !== false);
      })
      .catch(() => {});

    // Fetch customers (returns mock data if not connected)
    fetch('/api/quickbooks/customers')
      .then(res => res.json())
      .then(data => {
        setQbClients(data.customers || []);
        setDataSource(data.source || 'mock');
        setQbLoading(false);
      })
      .catch(() => setQbLoading(false));
  }, []);

  // Connect to QuickBooks
  const handleConnectQB = async () => {
    setConnectError(null);
    try {
      const res = await fetch('/api/quickbooks/connect');
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        const errorMsg = data.details || data.error || 'Could not generate QuickBooks auth URL.';
        setConnectError(errorMsg);
      }
    } catch {
      setConnectError('Failed to connect to QuickBooks. The server may be unreachable.');
    }
  };

  // Filter QB clients: hide already-added ones and apply search
  const addedQbIds = new Set(managedClients.map((mc) => mc.qbClient.id));
  const filteredQBClients = qbClients.filter(
    (c) =>
      !addedQbIds.has(c.id) &&
      (c.displayName.toLowerCase().includes(qbSearch.toLowerCase()) ||
        c.companyName.toLowerCase().includes(qbSearch.toLowerCase()))
  );

  // Add a QB client to managed list (via API)
  const handleAddClient = async (qbClient: QBClient) => {
    try {
      const res = await fetch('/api/managed-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qbClient }),
      });
      const data = await res.json();
      if (data.client) {
        setManagedClients([...managedClients, data.client]);
        setSelectedClientId(data.client.id);
      }
    } catch (error) {
      console.error('Error adding client:', error);
    }
  };

  // Remove a managed client (via API)
  const handleRemoveClient = async (clientId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}`, { method: 'DELETE' });
      setManagedClients(managedClients.filter((mc) => mc.id !== clientId));
      if (selectedClientId === clientId) setSelectedClientId(null);
    } catch (error) {
      console.error('Error removing client:', error);
    }
  };

  // Get the selected managed client
  const selectedClient = managedClients.find((mc) => mc.id === selectedClientId) || null;

  // Open contact form for ADD
  const openContactForm = (type: 'responsible' | 'employee') => {
    setContactFormType(type);
    setEditingContactId(null);
    setContactForm({ photo: null, name: '', email: '', phone: '', role: '' });
    setShowContactForm(true);
  };

  // Open contact form for EDIT
  const openEditForm = (type: 'responsible' | 'employee', contact: ContactPerson) => {
    setContactFormType(type);
    setEditingContactId(contact.id);
    setContactForm({
      photo: contact.photo,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
    });
    setResetMessage(null);
    setShowContactForm(true);
  };

  // Save contact (handles both ADD and EDIT) — via API
  const handleSaveContact = async () => {
    if (!selectedClient || !contactForm.name.trim() || !contactForm.email.trim()) return;

    if (editingContactId) {
      // EDIT existing contact via API
      try {
        const res = await fetch(
          `/api/managed-clients/${selectedClient.id}/contacts/${editingContactId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contactForm),
          }
        );
        const data = await res.json();
        if (data.contact) {
          setManagedClients(
            managedClients.map((mc) => {
              if (mc.id !== selectedClient.id) return mc;
              if (contactFormType === 'responsible' && mc.responsiblePerson?.id === editingContactId) {
                return { ...mc, responsiblePerson: { ...data.contact, id: editingContactId } };
              }
              return {
                ...mc,
                subEmployees: mc.subEmployees.map((e) =>
                  e.id === editingContactId ? { ...data.contact, id: editingContactId } : e
                ),
              };
            })
          );
        }
      } catch (error) {
        console.error('Error updating contact:', error);
      }
      setShowContactForm(false);
      setEditingContactId(null);
    } else {
      // ADD new contact via API
      try {
        const res = await fetch(`/api/managed-clients/${selectedClient.id}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...contactForm,
            type: contactFormType,
          }),
        });
        const data = await res.json();
        if (data.contact) {
          setManagedClients(
            managedClients.map((mc) => {
              if (mc.id !== selectedClient.id) return mc;
              if (contactFormType === 'responsible') {
                return { ...mc, responsiblePerson: data.contact };
              }
              return { ...mc, subEmployees: [...mc.subEmployees, data.contact] };
            })
          );
        }
      } catch (error) {
        console.error('Error adding contact:', error);
      }

      // Send invitation email
      try {
        await fetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: contactForm.email,
            name: contactForm.name,
            role: contactForm.role || 'Staff Member',
            companyName: selectedClient.qbClient.companyName,
          }),
        });
      } catch (error) {
        console.error('Error sending invitation:', error);
      }

      setShowContactForm(false);
      setEditingContactId(null);
    }
  };

  // Remove a sub-employee (via API)
  const handleRemoveEmployee = async (clientId: string, employeeId: string) => {
    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${employeeId}`, {
        method: 'DELETE',
      });
      setManagedClients(
        managedClients.map((mc) => {
          if (mc.id !== clientId) return mc;
          return { ...mc, subEmployees: mc.subEmployees.filter((e) => e.id !== employeeId) };
        })
      );
    } catch (error) {
      console.error('Error removing employee:', error);
    }
  };

  // Remove responsible person (via API)
  const handleRemoveResponsible = async (clientId: string) => {
    const client = managedClients.find((mc) => mc.id === clientId);
    if (!client?.responsiblePerson) return;

    try {
      await fetch(`/api/managed-clients/${clientId}/contacts/${client.responsiblePerson.id}`, {
        method: 'DELETE',
      });
      setManagedClients(
        managedClients.map((mc) => {
          if (mc.id !== clientId) return mc;
          return { ...mc, responsiblePerson: null };
        })
      );
    } catch (error) {
      console.error('Error removing responsible:', error);
    }
  };

  // Pencil icon for edit buttons
  const EditIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );

  // Trash icon
  const TrashIcon = ({ size = 'w-5 h-5' }: { size?: string }) => (
    <svg className={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-gray-500 mt-1">Import clients from QuickBooks and manage their contacts</p>
      </div>

      <div className="flex gap-6 h-[calc(100vh-180px)]">
        {/* ============================================================ */}
        {/* LEFT PANEL: QuickBooks Clients (Import List) */}
        {/* ============================================================ */}
        <div className="w-80 flex-shrink-0 flex flex-col">
          <div className="card flex-1 flex flex-col !p-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 ${qbConnected && dataSource === 'quickbooks' ? 'bg-green-100' : 'bg-yellow-100'} rounded flex items-center justify-center`}>
                    <span className={`${qbConnected && dataSource === 'quickbooks' ? 'text-green-600' : 'text-yellow-600'} text-xs font-bold`}>QB</span>
                  </div>
                  <h2 className="font-semibold text-sm">QuickBooks Clients</h2>
                </div>
                {(!qbConnected || (qbConnected && dataSource === 'mock')) && !qbLoading && (
                  <button
                    onClick={handleConnectQB}
                    className="text-[10px] bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded transition-colors"
                  >
                    {qbConnected && dataSource === 'mock' ? 'Reconnect' : 'Connect'}
                  </button>
                )}
              </div>
              {!credentialsConfigured && (
                <p className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded mb-2">
                  QuickBooks credentials are missing on the server. Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in Vercel → Settings → Environment Variables, then redeploy.
                </p>
              )}
              {connectError && (
                <p className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded mb-2">
                  {connectError}
                </p>
              )}
              {dataSource === 'mock' && credentialsConfigured && (
                <p className="text-[10px] text-yellow-600 bg-yellow-50 px-2 py-1 rounded mb-2">
                  {qbConnected
                    ? 'QuickBooks session expired — click Reconnect to restore your real clients'
                    : 'Showing demo data — connect QuickBooks for real clients'}
                </p>
              )}
              {dataSource === 'quickbooks' && (
                <p className="text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded mb-2">
                  Connected — showing live QuickBooks data
                </p>
              )}
              <input
                type="text"
                placeholder="Search clients..."
                value={qbSearch}
                onChange={(e) => setQbSearch(e.target.value)}
                className="input-field text-sm !py-2"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {dataSource === 'quickbooks' && filteredQBClients.length > 0 ? (
                filteredQBClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar photo={null} name={client.displayName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{client.displayName}</p>
                        <p className="text-xs text-gray-500 truncate">{client.companyName}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddClient(client)}
                      className="flex-shrink-0 ml-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                ))
              ) : dataSource === 'quickbooks' ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  {qbSearch ? 'No matching clients' : 'All clients have been added'}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-sm text-gray-400">Connect QuickBooks to see your clients</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                {dataSource === 'quickbooks'
                  ? `${filteredQBClients.length} client${filteredQBClients.length !== 1 ? 's' : ''} available`
                  : 'Not connected'}
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* MIDDLE PANEL: My Clients (Selected/Added List) */}
        {/* ============================================================ */}
        <div className="w-72 flex-shrink-0 flex flex-col">
          <div className="card flex-1 flex flex-col !p-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                My Clients
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {managedClients.length > 0 ? (
                managedClients.map((mc) => (
                  <div
                    key={mc.id}
                    onClick={() => setSelectedClientId(mc.id)}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors ${
                      selectedClientId === mc.id
                        ? 'bg-brand-50 border-l-2 border-l-brand-600'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <Avatar photo={null} name={mc.qbClient.displayName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{mc.qbClient.displayName}</p>
                      <p className="text-xs text-gray-500 truncate">{mc.qbClient.companyName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {mc.responsiblePerson && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                            Responsible set
                          </span>
                        )}
                        {mc.subEmployees.length > 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                            {mc.subEmployees.length} employee{mc.subEmployees.length !== 1 ? 's' : ''}
                          </span>
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
                  <p className="text-sm text-gray-400">No clients added yet</p>
                  <p className="text-xs text-gray-400 mt-1">Click &quot;Add&quot; on a QuickBooks client</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                {managedClients.length} client{managedClients.length !== 1 ? 's' : ''} managed
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT PANEL: Client Detail (Responsible + Sub-Employees) */}
        {/* ============================================================ */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedClient ? (
            <div className="card flex-1 !p-0 overflow-y-auto">
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
                  <button
                    onClick={() => handleRemoveClient(selectedClient.id)}
                    className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Street View Image */}
              {(selectedClient.qbClient.address || selectedClient.qbClient.city) && (
                <div className="px-5 pt-4 pb-2">
                  <StreetView
                    address={selectedClient.qbClient.address}
                    city={selectedClient.qbClient.city}
                    province={selectedClient.qbClient.province}
                    postalCode={selectedClient.qbClient.postalCode}
                    className="h-[180px]"
                  />
                </div>
              )}

              {/* Responsible Person Section */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Responsible Person
                  </h3>
                  {!selectedClient.responsiblePerson && (
                    <button
                      onClick={() => openContactForm('responsible')}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      + Set Responsible
                    </button>
                  )}
                </div>

                {selectedClient.responsiblePerson ? (
                  <div className="flex items-center gap-4 bg-green-50 rounded-xl p-4">
                    <Avatar
                      photo={selectedClient.responsiblePerson.photo}
                      name={selectedClient.responsiblePerson.name}
                      size="lg"
                    />
                    <div className="flex-1">
                      <p className="font-semibold">{selectedClient.responsiblePerson.name}</p>
                      <p className="text-sm text-gray-600">{selectedClient.responsiblePerson.role}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span>{selectedClient.responsiblePerson.email}</span>
                        <span>{selectedClient.responsiblePerson.phone}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditForm('responsible', selectedClient.responsiblePerson!)}
                        className="text-gray-400 hover:text-brand-600 transition-colors p-1.5 rounded-lg hover:bg-white"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => handleRemoveResponsible(selectedClient.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-white"
                        title="Remove"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No responsible person assigned yet</p>
                )}
              </div>

              {/* Sub-Employees Section */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Staff / Employees
                  </h3>
                  <button
                    onClick={() => openContactForm('employee')}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    + Add Employee
                  </button>
                </div>

                {selectedClient.subEmployees.length > 0 ? (
                  <div className="space-y-2">
                    {selectedClient.subEmployees.map((emp) => (
                      <div
                        key={emp.id}
                        className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 hover:bg-blue-50 transition-colors"
                      >
                        <Avatar photo={emp.photo} name={emp.name} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{emp.name}</p>
                          <p className="text-xs text-gray-500">{emp.role}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                            <span>{emp.email}</span>
                            <span>{emp.phone}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditForm('employee', emp)}
                            className="text-gray-400 hover:text-brand-600 transition-colors p-1.5 rounded-lg hover:bg-white"
                            title="Edit"
                          >
                            <EditIcon />
                          </button>
                          <button
                            onClick={() => handleRemoveEmployee(selectedClient.id, emp.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-white"
                            title="Remove"
                          >
                            <TrashIcon size="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No employees added yet</p>
                )}
              </div>
            </div>
          ) : (
            <div className="card flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <p className="text-gray-400 text-sm">Select a client from &quot;My Clients&quot; to manage</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* ADD / EDIT CONTACT MODAL */}
      {/* ============================================================ */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {editingContactId
                  ? (contactFormType === 'responsible' ? 'Edit Responsible Person' : 'Edit Employee')
                  : (contactFormType === 'responsible' ? 'Set Responsible Person' : 'Add Employee')
                }
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {contactFormType === 'responsible'
                  ? 'The main contact person for this client'
                  : 'A staff member at this client\'s company'}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {/* Photo Upload with Avatar fallback */}
              <div className="flex items-center gap-4">
                <Avatar
                  photo={contactForm.photo}
                  name={contactForm.name || '?'}
                  size="xl"
                  editable
                  onPhotoChange={(base64) => setContactForm({ ...contactForm, photo: base64 })}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Profile Photo</p>
                  <p className="text-xs text-gray-500 mt-0.5">Click the avatar to upload a photo</p>
                  <p className="text-xs text-gray-400">Or leave empty for auto-generated initials</p>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  className="input-field"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="e.g. Pierre Martin"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  className="input-field"
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  placeholder="e.g. pierre@company.ca"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  className="input-field"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  placeholder="e.g. 514-555-0000"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <input
                  className="input-field"
                  value={contactForm.role}
                  onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                  placeholder="e.g. IT Manager, Receptionist, Owner"
                />
              </div>

              {/* Reset Password — only visible when editing */}
              {editingContactId && contactForm.email && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Password</p>
                      <p className="text-xs text-gray-400">Send a password reset email to this contact</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetPassword(contactForm.email, contactForm.name)}
                      disabled={resetSending || (!!resetCountdowns[contactForm.email] && resetCountdowns[contactForm.email] > 0)}
                      className="text-xs bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      {resetSending
                        ? 'Sending...'
                        : resetCountdowns[contactForm.email] && resetCountdowns[contactForm.email] > 0
                          ? `Wait ${resetCountdowns[contactForm.email]}s`
                          : 'Reset Password'
                      }
                    </button>
                  </div>
                  {resetMessage && (
                    <p className={`text-xs mt-2 ${resetMessage.includes('sent') ? 'text-green-600' : 'text-yellow-600'}`}>
                      {resetMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setShowContactForm(false); setEditingContactId(null); }} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSaveContact}
                disabled={!contactForm.name.trim() || !contactForm.email.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {editingContactId
                  ? 'Save Changes'
                  : (contactFormType === 'responsible' ? 'Set as Responsible' : 'Add Employee')
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
