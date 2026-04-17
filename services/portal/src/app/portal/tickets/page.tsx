'use client';

import { useState, useEffect } from 'react';
import Avatar from '@/components/Avatar';
import { Ticket, TicketPriority, TicketStatus, ManagedClient, ContactPerson } from '@/lib/mock-data';
import PageHeader from '@/components/PageHeader';

const priorityColors = {
  critical: 'bg-red-100 text-red-800 border border-red-300',
  high: 'bg-orange-100 text-orange-800 border border-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  low: 'bg-blue-100 text-blue-800 border border-blue-300',
};

const statusColors = {
  open: 'bg-blue-100 text-blue-800 border border-blue-300',
  in_progress: 'bg-purple-100 text-purple-800 border border-purple-300',
  waiting: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  resolved: 'bg-green-100 text-green-800 border border-green-300',
  closed: 'bg-gray-100 text-gray-800 border border-gray-300',
};

interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export default function ClientTicketsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [managedClient, setManagedClient] = useState<ManagedClient | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Registration form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    photo: null as string | null,
  });

  // Create ticket form state
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    description: '',
    priority: 'medium' as TicketPriority,
    attachments: [] as { id: string; name: string; type: 'image' | 'video'; url: string }[],
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  // Load current user and match to managed client from DATABASE
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        const u = data.user || data;
        const user: CurrentUser = {
          id: u.userId || u.id || '',
          name: u.name || '',
          email: u.email || '',
        };
        setCurrentUser(user);

        // Load managed clients from DATABASE and match by email or company name
        const clientsRes = await fetch('/api/managed-clients');
        const clientsData = await clientsRes.json();
        if (clientsData.clients) {
          const clients: ManagedClient[] = clientsData.clients;
          // Try matching by: QB email, display name, responsible person email, or employee email
          const userClient = clients.find(
            (c) =>
              c.qbClient.email?.toLowerCase() === user.email.toLowerCase() ||
              c.qbClient.displayName?.toLowerCase() === user.name.toLowerCase() ||
              c.responsiblePerson?.email?.toLowerCase() === user.email.toLowerCase() ||
              c.subEmployees?.some((e: { email?: string }) => e.email?.toLowerCase() === user.email.toLowerCase())
          );

          if (userClient) {
            setManagedClient(userClient);
            // Check if any contact person exists (responsible or employees)
            const hasContact = !!userClient.responsiblePerson || userClient.subEmployees.length > 0;
            setIsRegistered(hasContact);

            // Pre-fill registration form with existing responsible person data
            if (userClient.responsiblePerson) {
              setFormData({
                name: userClient.responsiblePerson.name || '',
                email: userClient.responsiblePerson.email || '',
                phone: userClient.responsiblePerson.phone || '',
                role: userClient.responsiblePerson.role || '',
                photo: userClient.responsiblePerson.photo || null,
              });
            }

            // Load tickets for this client from DATABASE
            const ticketsRes = await fetch(`/api/tickets?clientId=${userClient.id}`);
            const ticketsData = await ticketsRes.json();
            if (ticketsData.tickets) {
              setTickets(ticketsData.tickets);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const handleRegisterSubmit = async () => {
    if (!formData.name || !formData.email || !currentUser || !managedClient) return;

    try {
      // Add contact via API
      const res = await fetch(`/api/managed-clients/${managedClient.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          photo: formData.photo,
          type: 'responsible',
        }),
      });

      const data = await res.json();
      if (data.contact) {
        setManagedClient({
          ...managedClient,
          responsiblePerson: data.contact,
        });
        setIsRegistered(true);
        setFormData({ name: '', email: '', phone: '', role: '', photo: null });
      }
    } catch (error) {
      console.error('Error registering contact:', error);
    }
  };

  const handlePhotoChange = (base64: string) => {
    setFormData({ ...formData, photo: base64 });
    setImagePreview(base64);
  };

  const handleCreateTicket = async () => {
    if (!ticketForm.subject || !ticketForm.description || !currentUser || !managedClient) return;

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: managedClient.id,
          clientCompanyName: managedClient.qbClient.companyName,
          createdBy: {
            name: managedClient.responsiblePerson?.name || currentUser.name,
            email: managedClient.responsiblePerson?.email || currentUser.email,
            role: managedClient.responsiblePerson?.role || 'Client',
          },
          subject: ticketForm.subject,
          description: ticketForm.description,
          priority: ticketForm.priority,
          attachments: ticketForm.attachments,
        }),
      });

      const data = await res.json();
      if (data.ticket) {
        setTickets([...tickets, data.ticket]);
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
    }

    // Reset form
    setTicketForm({
      subject: '',
      description: '',
      priority: 'medium',
      attachments: [],
    });
    setImagePreview(null);
    setShowCreateForm(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const newAttachment = {
        id: `att-${Date.now()}`,
        name: file.name,
        type,
        url,
      };

      setTicketForm({
        ...ticketForm,
        attachments: [...ticketForm.attachments, newAttachment],
      });

      if (type === 'image') {
        setImagePreview(url);
      }
    };

    reader.readAsDataURL(file);
  };

  const removeAttachment = (id: string) => {
    setTicketForm({
      ...ticketForm,
      attachments: ticketForm.attachments.filter((a) => a.id !== id),
    });
  };

  // Still loading
  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // No managed client match found
  if (!currentUser || !managedClient) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="card text-center py-12">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Account Not Set Up</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Your account hasn&apos;t been linked to a client profile yet. Please contact your LaserNet administrator to get access to the support ticket system.
          </p>
        </div>
      </div>
    );
  }

  // Registration form
  if (!isRegistered) {
    return (
      <div>
        <PageHeader title="Complete Your Profile" />
        <div className="card">
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Before you can create support tickets, please register as the contact person for{' '}
            <span className="font-semibold">{managedClient.qbClient.companyName}</span>.
          </p>

          <div className="space-y-4 mb-6">
            {/* Photo Upload */}
            <div className="flex flex-col items-center">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Photo</label>
              <Avatar
                photo={formData.photo}
                name={formData.name || 'User'}
                size="lg"
                editable={true}
                onPhotoChange={handlePhotoChange}
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field"
                placeholder="Your full name"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field"
                placeholder="your@email.com"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input-field"
                placeholder="(555) 123-4567"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Role</label>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="input-field"
                placeholder="e.g., Manager, Owner, Technician"
              />
            </div>
          </div>

          <button
            onClick={handleRegisterSubmit}
            disabled={!formData.name || !formData.email}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Complete Registration
          </button>
        </div>
      </div>
    );
  }

  // Tickets page
  return (
    <div>
      <PageHeader
        title="Support Tickets"
        subtitle={managedClient.qbClient.companyName}
        actions={
          !showCreateForm ? (
            <button onClick={() => setShowCreateForm(true)} className="btn-primary">
              Create Ticket
            </button>
          ) : undefined
        }
      />

      {/* Create Ticket Form */}
      {showCreateForm && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Create New Ticket</h2>

          <div className="space-y-4">
            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subject *</label>
              <input
                type="text"
                value={ticketForm.subject}
                onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                className="input-field"
                placeholder="Brief description of your issue"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description *</label>
              <textarea
                value={ticketForm.description}
                onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                className="input-field min-h-32"
                placeholder="Provide detailed information about your issue"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority</label>
              <select
                value={ticketForm.priority}
                onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value as TicketPriority })}
                className="input-field"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Attachments</label>

              {/* Upload Buttons */}
              <div className="flex gap-3 mb-4">
                <label className="btn-secondary cursor-pointer text-sm py-2 px-4">
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'image')}
                    className="hidden"
                  />
                </label>
                <label className="btn-secondary cursor-pointer text-sm py-2 px-4">
                  Upload Video
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => handleFileUpload(e, 'video')}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Attachment List */}
              {ticketForm.attachments.length > 0 && (
                <div className="space-y-2 mb-4">
                  {ticketForm.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">{att.name}</span>
                      <button
                        onClick={() => removeAttachment(att.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Image Preview */}
              {imagePreview && (
                <div className="mb-4">
                  <img src={imagePreview} alt="Preview" className="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-48" />
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleCreateTicket}
                disabled={!ticketForm.subject || !ticketForm.description}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Ticket
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setTicketForm({
                    subject: '',
                    description: '',
                    priority: 'medium',
                    attachments: [],
                  });
                  setImagePreview(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tickets List */}
      {tickets.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No tickets yet</p>
          {!showCreateForm && (
            <button onClick={() => setShowCreateForm(true)} className="btn-primary">
              Create Your First Ticket
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{ticket.ticketNumber}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[ticket.status]}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${priorityColors[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">{ticket.subject}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">{ticket.description.substring(0, 100)}...</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Created: {new Date(ticket.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {ticket.attachments.length > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 ml-4">
                    {ticket.attachments.length} attachment{ticket.attachments.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
