'use client';

import { useState, useEffect } from 'react';
import { Ticket, TicketPriority, TicketStatus, Invoice, mockInvoices } from '@/lib/mock-data';
import { useLanguage } from '@/lib/LanguageContext';

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

const statusFlow: Record<TicketStatus, TicketStatus | null> = {
  open: 'in_progress',
  in_progress: 'waiting',
  waiting: 'resolved',
  resolved: 'closed',
  closed: null,
};

export default function AdminTicketsPage() {
  const { t } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  // Load tickets from DATABASE API
  useEffect(() => {
    fetch('/api/tickets')
      .then((res) => res.json())
      .then((data) => {
        if (data.tickets) {
          setTickets(data.tickets);
        }
      })
      .catch((err) => console.error('Error loading tickets:', err));

    // Mock invoices for now (these come from QuickBooks)
    setInvoices(mockInvoices);
  }, []);

  // Filter tickets based on status and priority
  useEffect(() => {
    let filtered = tickets;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter((t) => t.priority === priorityFilter);
    }

    setFilteredTickets(filtered);
  }, [tickets, statusFilter, priorityFilter]);

  const handleUpdateStatus = async (ticket: Ticket) => {
    const nextStatus = statusFlow[ticket.status];
    if (!nextStatus) return;

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.ticket) {
        const updatedTickets = tickets.map((t) => (t.id === ticket.id ? data.ticket : t));
        setTickets(updatedTickets);
        setSelectedTicket(data.ticket);
      }
    } catch (error) {
      console.error('Error updating ticket status:', error);
    }
  };

  const handleLinkInvoice = async (ticket: Ticket) => {
    if (!selectedInvoiceId) return;

    const invoice = invoices.find((inv) => inv.id === selectedInvoiceId);
    if (!invoice) return;

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedInvoiceId: invoice.id,
          linkedInvoiceNumber: invoice.invoiceNumber,
        }),
      });
      const data = await res.json();
      if (data.ticket) {
        const updatedTickets = tickets.map((t) => (t.id === ticket.id ? data.ticket : t));
        setTickets(updatedTickets);
        setSelectedTicket(data.ticket);
        setSelectedInvoiceId(null);
      }
    } catch (error) {
      console.error('Error linking invoice:', error);
    }
  };

  const getAvailableInvoices = (ticket: Ticket) => {
    return invoices.filter((inv) => inv.clientId === ticket.clientId);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('tickets', 'title')}</h1>
        <div className="text-sm text-gray-600">
          {t('tickets', 'totalTickets')} <span className="font-semibold">{filteredTickets.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6 flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('tickets', 'statusFilter')}</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'all')}
            className="input-field"
          >
            <option value="all">{t('tickets', 'allStatuses')}</option>
            <option value="open">{t('tickets', 'open')}</option>
            <option value="in_progress">{t('tickets', 'inProgress')}</option>
            <option value="waiting">{t('tickets', 'waiting')}</option>
            <option value="resolved">{t('tickets', 'resolved')}</option>
            <option value="closed">{t('tickets', 'closed')}</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('tickets', 'priorityFilter')}</label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | 'all')}
            className="input-field"
          >
            <option value="all">{t('tickets', 'allPriorities')}</option>
            <option value="critical">{t('tickets', 'critical')}</option>
            <option value="high">{t('tickets', 'high')}</option>
            <option value="medium">{t('tickets', 'medium')}</option>
            <option value="low">{t('tickets', 'low')}</option>
          </select>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Tickets List */}
        <div className="flex-1">
          {filteredTickets.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">{t('tickets', 'noTickets')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`card cursor-pointer transition-all hover:shadow-md ${
                    selectedTicket?.id === ticket.id ? 'ring-2 ring-brand-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-gray-900">{ticket.ticketNumber}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[ticket.status]}`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${priorityColors[ticket.priority]}`}>
                          {ticket.priority}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{ticket.clientCompanyName}</p>
                      <p className="text-gray-900 font-medium">{ticket.subject}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Created: {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedTicket && (
          <div className="w-96 card sticky top-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{t('tickets', 'ticketDetails')}</h2>

            {/* Ticket Header */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-semibold text-gray-900">{selectedTicket.ticketNumber}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[selectedTicket.status]}`}>
                  {selectedTicket.status.replace('_', ' ')}
                </span>
              </div>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${priorityColors[selectedTicket.priority]}`}>
                {selectedTicket.priority}
              </span>
            </div>

            {/* Client & Creator Info */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-1">{t('tickets', 'clientCompany')}</p>
              <p className="text-gray-900 font-semibold">{selectedTicket.clientCompanyName}</p>
              <p className="text-sm font-medium text-gray-700 mt-3 mb-1">{t('tickets', 'createdBy')}</p>
              <p className="text-gray-900">{selectedTicket.createdBy.name}</p>
              <p className="text-xs text-gray-600">{selectedTicket.createdBy.email}</p>
              <p className="text-xs text-gray-600">{selectedTicket.createdBy.role}</p>
            </div>

            {/* Subject & Description */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-1">{t('tickets', 'subject')}</p>
              <p className="text-gray-900 font-semibold">{selectedTicket.subject}</p>
              <p className="text-sm font-medium text-gray-700 mt-3 mb-1">{t('common', 'description')}</p>
              <p className="text-gray-700 text-sm whitespace-pre-wrap">{selectedTicket.description}</p>
            </div>

            {/* Attachments */}
            {selectedTicket.attachments.length > 0 && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">{t('tickets', 'attachments')}</p>
                <div className="space-y-2">
                  {selectedTicket.attachments.map((att) => (
                    <div key={att.id}>
                      {att.type === 'image' ? (
                        <img src={att.url} alt={att.name} className="max-w-full h-auto rounded-lg border border-gray-200" />
                      ) : (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 hover:underline text-sm"
                        >
                          {att.name}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Link Invoice Section */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-2">{t('tickets', 'linkInvoice')}</p>
              {selectedTicket.linkedInvoiceNumber ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-2">
                  <p className="text-sm text-gray-700">
                    {t('tickets', 'linked')} <span className="font-semibold">{selectedTicket.linkedInvoiceNumber}</span>
                  </p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedInvoiceId || ''}
                    onChange={(e) => setSelectedInvoiceId(e.target.value || null)}
                    className="input-field text-sm flex-1"
                  >
                    <option value="">{t('tickets', 'selectInvoice')}</option>
                    {getAvailableInvoices(selectedTicket).map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} - ${inv.amount}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleLinkInvoice(selectedTicket)}
                    disabled={!selectedInvoiceId}
                    className="btn-primary text-sm py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('tickets', 'link')}
                  </button>
                </div>
              )}
            </div>

            {/* Status Control */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">{t('tickets', 'updateStatus')}</p>
              {statusFlow[selectedTicket.status] ? (
                <button
                  onClick={() => handleUpdateStatus(selectedTicket)}
                  className="btn-primary w-full text-sm py-2"
                >
                  {t('tickets', 'moveTo')} {statusFlow[selectedTicket.status]?.replace('_', ' ')}
                </button>
              ) : (
                <p className="text-xs text-gray-500">{t('tickets', 'ticketClosed')}</p>
              )}
            </div>

            {/* Metadata */}
            <div className="text-xs text-gray-500">
              <p>{t('tickets', 'created')} {new Date(selectedTicket.createdAt).toLocaleString()}</p>
              <p>{t('tickets', 'updated')} {new Date(selectedTicket.updatedAt).toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
