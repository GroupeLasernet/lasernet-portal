'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

// ── Types ────────────────────────────────────────────────────────────────────

interface Improvement {
  id: string;
  title: string;
  description: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'new' | 'in_progress' | 'done' | 'dismissed';
  createdBy: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

type FilterMode = 'all' | 'active' | 'done';

// ── Priority helpers ─────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-blue-100 text-blue-800 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-500',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ImprovementsPage() {
  const { t } = useLanguage();

  const [items, setItems] = useState<Improvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('active');

  // ── New-item form ──
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [saving, setSaving] = useState(false);

  // ── Voice ──
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // ── Inline-edit ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('medium');

  // ── Check speech support on mount ──
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);

  // ── Fetch ──
  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/improvements');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.improvements ?? []);
    } catch {
      console.error('Failed to fetch improvements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── Create ──
  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/improvements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priority }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(prev => [data.improvement, ...prev]);
      setTitle('');
      setDescription('');
      setPriority('medium');
      setShowForm(false);
    } catch {
      alert('Error creating improvement');
    } finally {
      setSaving(false);
    }
  };

  // ── Update status ──
  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/improvements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(prev => prev.map(i => i.id === id ? data.improvement : i));
    } catch {
      alert('Error updating improvement');
    }
  };

  // ── Update priority ──
  const handlePriorityChange = async (id: string, newPriority: string) => {
    try {
      const res = await fetch(`/api/improvements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(prev => prev.map(i => i.id === id ? data.improvement : i));
    } catch {
      alert('Error updating priority');
    }
  };

  // ── Save inline edit ──
  const handleSaveEdit = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      const res = await fetch(`/api/improvements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, description: editDescription, priority: editPriority }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(prev => prev.map(i => i.id === id ? data.improvement : i));
      setEditingId(null);
    } catch {
      alert('Error updating improvement');
    }
  };

  // ── Delete ──
  const handleDelete = async (id: string) => {
    if (!confirm(t('improvements', 'deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/improvements/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setItems(prev => prev.filter(i => i.id !== id));
    } catch {
      alert('Error deleting improvement');
    }
  };

  // ── Voice-to-text ──
  const toggleRecording = () => {
    if (!speechSupported) {
      alert(t('improvements', 'micNotSupported'));
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'fr-CA';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setTitle(transcript);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  // ── Filter + sort ──
  const filtered = items
    .filter(item => {
      if (filter === 'active') return item.status === 'new' || item.status === 'in_progress';
      if (filter === 'done') return item.status === 'done' || item.status === 'dismissed';
      return true;
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  // ── Priority label helper ──
  const priorityLabel = (p: string) => t('improvements', `priority${p.charAt(0).toUpperCase() + p.slice(1)}`);
  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      new: 'statusNew',
      in_progress: 'statusInProgress',
      done: 'statusDone',
      dismissed: 'statusDismissed',
    };
    return t('improvements', map[s] || s);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title={t('improvements', 'title')} subtitle={t('improvements', 'subtitle')} />

      {/* ── Toolbar: filter tabs + add button ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['active', 'all', 'done'] as FilterMode[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('improvements', f === 'active' ? 'filterActive' : f === 'done' ? 'filterDone' : 'filterAll')}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowForm(prev => !prev)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('improvements', 'addImprovement')}
        </button>
      </div>

      {/* ── New item form ── */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <div className="space-y-4">
            {/* Title + mic */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('improvements', 'titleLabel')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={t('improvements', 'titlePlaceholder')}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreate()}
                />
                {speechSupported && (
                  <button
                    onClick={toggleRecording}
                    className={`px-3 py-2 rounded-lg border transition-colors flex items-center gap-1.5 text-sm ${
                      isRecording
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                    title={isRecording ? t('improvements', 'micStop') : t('improvements', 'micStart')}
                  >
                    {isRecording ? (
                      <>
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        {t('improvements', 'micStop')}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        {t('improvements', 'micStart')}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('improvements', 'descriptionLabel')}
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('improvements', 'descriptionPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Priority + submit */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">{t('improvements', 'priority')}:</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="critical">{t('improvements', 'priorityCritical')}</option>
                  <option value="high">{t('improvements', 'priorityHigh')}</option>
                  <option value="medium">{t('improvements', 'priorityMedium')}</option>
                  <option value="low">{t('improvements', 'priorityLow')}</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setShowForm(false); setTitle(''); setDescription(''); }}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  {t('common', 'cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving || !title.trim()}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? t('common', 'saving') : t('common', 'create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">{t('common', 'loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('improvements', 'noImprovements')}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div
              key={item.id}
              className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${
                item.status === 'done' || item.status === 'dismissed' ? 'opacity-60' : ''
              }`}
            >
              {editingId === item.id ? (
                /* ── Inline edit mode ── */
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <textarea
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <select
                      value={editPriority}
                      onChange={e => setEditPriority(e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="critical">{t('improvements', 'priorityCritical')}</option>
                      <option value="high">{t('improvements', 'priorityHigh')}</option>
                      <option value="medium">{t('improvements', 'priorityMedium')}</option>
                      <option value="low">{t('improvements', 'priorityLow')}</option>
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingId(null)} className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700">
                        {t('common', 'cancel')}
                      </button>
                      <button
                        onClick={() => handleSaveEdit(item.id)}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                      >
                        {t('common', 'save')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Display mode ── */
                <div className="flex items-start gap-3">
                  {/* Priority badge */}
                  <span className={`mt-0.5 px-2 py-0.5 text-xs font-medium rounded-full border ${PRIORITY_COLORS[item.priority]}`}>
                    {priorityLabel(item.priority)}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm font-semibold text-gray-900 ${item.status === 'done' ? 'line-through' : ''}`}>
                        {item.title}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[item.status]}`}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                    )}
                    <div className="text-xs text-gray-400 mt-1.5">
                      {t('improvements', 'createdBy')} {item.createdBy.name} — {new Date(item.createdAt).toLocaleDateString('fr-CA')}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Status dropdown */}
                    <select
                      value={item.status}
                      onChange={e => handleStatusChange(item.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      <option value="new">{t('improvements', 'statusNew')}</option>
                      <option value="in_progress">{t('improvements', 'statusInProgress')}</option>
                      <option value="done">{t('improvements', 'statusDone')}</option>
                      <option value="dismissed">{t('improvements', 'statusDismissed')}</option>
                    </select>

                    {/* Priority quick-change */}
                    <select
                      value={item.priority}
                      onChange={e => handlePriorityChange(item.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      <option value="critical">{t('improvements', 'priorityCritical')}</option>
                      <option value="high">{t('improvements', 'priorityHigh')}</option>
                      <option value="medium">{t('improvements', 'priorityMedium')}</option>
                      <option value="low">{t('improvements', 'priorityLow')}</option>
                    </select>

                    {/* Edit button */}
                    <button
                      onClick={() => {
                        setEditingId(item.id);
                        setEditTitle(item.title);
                        setEditDescription(item.description || '');
                        setEditPriority(item.priority);
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                      title={t('common', 'edit')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      title={t('common', 'delete')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
