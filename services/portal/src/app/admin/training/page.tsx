'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

interface Attendee {
  id: string;
  contactId: string;
  name: string;
  email: string;
  inviteSent: boolean;
  inviteSentAt: string | null;
  confirmed: boolean;
  confirmedAt: string | null;
}

interface TrainingFile {
  id: string;
  name: string;
  fileType: string;
  fileSize: number | null;
}

interface TrainingEvent {
  id: string;
  title: string;
  description: string | null;
  date: string;
  status: string;
  template: { id: string; name: string } | null;
  attendees: Attendee[];
  files: TrainingFile[];
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  role: string;
  clientName: string;
}

export default function TrainingPage() {
  const { t } = useLanguage();
  const [events, setEvents] = useState<TrainingEvent[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<TrainingEvent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Create form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [formAttendees, setFormAttendees] = useState<{ contactId: string; name: string; email: string }[]>([]);
  const [contactSearch, setContactSearch] = useState('');

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/training/events');
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/training/templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/managed-clients');
      const data = await res.json();
      const allContacts: Contact[] = [];
      for (const client of (data.clients || [])) {
        if (client.responsiblePerson) {
          allContacts.push({
            id: client.responsiblePerson.id || `rp-${client.id}`,
            name: client.responsiblePerson.name || '',
            email: client.responsiblePerson.email || '',
            role: 'Main Contact',
            clientName: client.displayName || client.companyName || '',
          });
        }
        for (const emp of (client.subEmployees || [])) {
          allContacts.push({
            id: emp.id || `emp-${client.id}-${emp.name}`,
            name: emp.name || '',
            email: emp.email || '',
            role: 'Staff',
            clientName: client.displayName || client.companyName || '',
          });
        }
      }
      setContacts(allContacts);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchTemplates();
    fetchContacts();
  }, [fetchEvents, fetchTemplates, fetchContacts]);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formDate) return;
    try {
      const res = await fetch('/api/training/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDesc || null,
          date: formDate,
          templateId: formTemplateId || null,
          attendees: formAttendees,
        }),
      });
      if (res.ok) {
        resetForm();
        fetchEvents();
      }
    } catch (err) {
      console.error('Failed to create event:', err);
    }
  };

  const handleUpdateStatus = async (eventId: string, status: string) => {
    try {
      await fetch(`/api/training/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchEvents();
      if (selectedEvent?.id === eventId) {
        setSelectedEvent((prev) => prev ? { ...prev, status } : null);
      }
    } catch (err) {
      console.error('Failed to update event status:', err);
    }
  };

  const handleDelete = async (eventId: string) => {
    try {
      await fetch(`/api/training/events/${eventId}`, { method: 'DELETE' });
      if (selectedEvent?.id === eventId) setSelectedEvent(null);
      fetchEvents();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  const handleFileUpload = async (eventId: string, file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        let fileType = 'other';
        if (file.type.startsWith('application/pdf')) fileType = 'pdf';
        else if (file.type.startsWith('video/')) fileType = 'video';
        else if (file.type.startsWith('image/')) fileType = 'image';

        await fetch('/api/training/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            fileType,
            fileData: reader.result as string,
            fileSize: file.size,
            eventId,
          }),
        });
        setUploading(false);
        fetchEvents();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload file:', err);
      setUploading(false);
    }
  };

  const resetForm = () => {
    setShowCreate(false);
    setFormTitle('');
    setFormDesc('');
    setFormDate('');
    setFormTemplateId('');
    setFormAttendees([]);
    setContactSearch('');
  };

  const addAttendee = (contact: Contact) => {
    if (formAttendees.find((a) => a.contactId === contact.id)) return;
    setFormAttendees([...formAttendees, { contactId: contact.id, name: contact.name, email: contact.email }]);
    setContactSearch('');
  };

  const removeAttendee = (contactId: string) => {
    setFormAttendees(formAttendees.filter((a) => a.contactId !== contactId));
  };

  const filteredContacts = contactSearch.length > 0
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.email.toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.clientName.toLowerCase().includes(contactSearch.toLowerCase())
      )
    : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const upcomingEvents = events.filter((e) => e.status === 'scheduled' && new Date(e.date) >= new Date());
  const pastEvents = events.filter((e) => e.status !== 'scheduled' || new Date(e.date) < new Date());

  return (
    <div>
      <PageHeader
        title={t('trainingPage', 'title')}
        actions={
          <button
            onClick={() => { setShowCreate(true); setSelectedEvent(null); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            {t('trainingPage', 'newEvent')}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Event List */}
        <div className="lg:col-span-1 space-y-4">
          {/* Upcoming */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{t('trainingPage', 'upcoming')}</h2>
            </div>
            {loading ? (
              <div className="p-4 text-sm text-gray-400">{t('common', 'loading')}</div>
            ) : upcomingEvents.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">{t('trainingPage', 'noUpcoming')}</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {upcomingEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => { setSelectedEvent(event); setShowCreate(false); }}
                    className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                      selectedEvent?.id === event.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-800">{event.title}</div>
                    <div className="text-xs text-gray-500 mt-1">{formatDate(event.date)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(event.status)}`}>
                        {event.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        {event.attendees.length} {event.attendees.length !== 1 ? t('trainingPage', 'attendeesLabel') : t('trainingPage', 'attendeesLabel')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Past / Completed */}
          {pastEvents.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{t('trainingPage', 'pastCompleted')}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {pastEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => { setSelectedEvent(event); setShowCreate(false); }}
                    className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                      selectedEvent?.id === event.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-700">{event.title}</div>
                    <div className="text-xs text-gray-400 mt-1">{formatDate(event.date)}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(event.status)}`}>
                      {event.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Detail Panel or Create Form */}
        <div className="lg:col-span-2">
          {showCreate ? (
            /* Create Event Form */
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('trainingPage', 'newTrainingEvent')}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('trainingPage', 'titleLabel')}</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder={t('trainingPage', 'cobotSafetyExample')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('trainingPage', 'descriptionLabel')}</label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={3}
                    placeholder={t('trainingPage', 'trainingDetails')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('trainingPage', 'dateLabel')}</label>
                    <input
                      type="datetime-local"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('trainingPage', 'templateOptional')}</label>
                    <select
                      value={formTemplateId}
                      onChange={(e) => setFormTemplateId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t('trainingPage', 'noTemplateOption')}</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Attendee picker */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('trainingPage', 'attendeesLabel')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder={t('trainingPage', 'searchContacts')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    {filteredContacts.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredContacts.slice(0, 10).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => addAttendee(c)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-50"
                          >
                            <span className="font-medium text-gray-800">{c.name}</span>
                            <span className="text-gray-400 ml-2">{c.email}</span>
                            <span className="text-gray-400 ml-2">({c.clientName})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {formAttendees.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {formAttendees.map((a) => (
                        <span key={a.contactId} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                          {a.name}
                          <button onClick={() => removeAttendee(a.contactId)} className="hover:text-blue-900">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                    {t('trainingPage', 'createEvent')}
                  </button>
                  <button onClick={resetForm} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300">
                    {t('common', 'cancel')}
                  </button>
                </div>
              </div>
            </div>
          ) : selectedEvent ? (
            /* Event Detail View */
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-800">{selectedEvent.title}</h2>
                    {selectedEvent.description && (
                      <p className="text-sm text-gray-500 mt-1">{selectedEvent.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-sm text-gray-600">{formatDate(selectedEvent.date)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(selectedEvent.status)}`}>
                        {t('trainingPage', selectedEvent.status as 'scheduled' | 'completed' | 'cancelled')}
                      </span>
                      {selectedEvent.template && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          {selectedEvent.template.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedEvent.status === 'scheduled' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedEvent.id, 'completed')}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                      >
                        {t('trainingPage', 'markComplete')}
                      </button>
                    )}
                    {selectedEvent.status === 'scheduled' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedEvent.id, 'cancelled')}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                      >
                        {t('common', 'cancel')}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(selectedEvent.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Attendees */}
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                  {t('trainingPage', 'attendeesLabel')} ({selectedEvent.attendees.length})
                </h3>
                {selectedEvent.attendees.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('trainingPage', 'noAttendees')}</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvent.attendees.map((att) => (
                      <div key={att.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{att.name}</span>
                          <span className="text-sm text-gray-400 ml-2">{att.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {att.confirmed ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{t('trainingPage', 'confirmed')}</span>
                          ) : att.inviteSent ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{t('trainingPage', 'invited')}</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{t('trainingPage', 'pending')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Files */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                  {t('common', 'download')} ({selectedEvent.files.length})
                </h3>
                {selectedEvent.files.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {selectedEvent.files.map((file) => (
                      <div key={file.id} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-sm">
                        <span className="text-gray-700">{file.name}</span>
                        <span className="text-xs text-gray-400">{file.fileType}</span>
                      </div>
                    ))}
                  </div>
                )}
                <label className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {uploading ? t('common', 'uploading') : t('trainingPage', 'attachFile')}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && selectedEvent) handleFileUpload(selectedEvent.id, f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-gray-400 text-lg">{t('trainingPage', 'selectOrCreate')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
