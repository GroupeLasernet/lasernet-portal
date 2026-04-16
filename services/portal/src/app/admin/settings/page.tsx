'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import HoldButton from '@/components/HoldButton';
import PageHeader from '@/components/PageHeader';

interface TrainingFile {
  id: string;
  name: string;
  fileType: string;
  fileSize: number | null;
  createdAt: string;
}

interface TrainingTemplate {
  id: string;
  name: string;
  description: string | null;
  files: TrainingFile[];
  events: { id: string; title: string; date: string; status: string }[];
  createdAt: string;
}

interface TeamAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  inviteExpiresAt: string | null;
}

export default function SettingsPage() {
  const { lang, setLang, t } = useLanguage();
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TrainingTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [langSaved, setLangSaved] = useState(false);

  // Team management
  const [team, setTeam] = useState<TeamAdmin[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [teamFeedback, setTeamFeedback] = useState<{ kind: 'ok' | 'warn' | 'err'; msg: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch('/api/admin/team');
      const data = await res.json();
      setTeam(data.admins || []);
    } catch (err) {
      console.error('Failed to fetch team:', err);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
    // Grab current user id so we can disable self-remove in UI.
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.user?.userId) setCurrentUserId(d.user.userId); else if (d?.user?.id) setCurrentUserId(d.user.id); })
      .catch(() => {});
  }, [fetchTeam]);

  const handleInvite = async () => {
    setInviteError(null);
    setLastInviteUrl(null);
    setTeamFeedback(null);
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setInviteError('Name and email are required.');
      return;
    }
    setInviteBusy(true);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Failed to invite.');
      } else {
        setInviteEmail('');
        setInviteName('');
        fetchTeam();
        if (data.emailSent) {
          setTeamFeedback({ kind: 'ok', msg: `Invite email sent to ${data.admin.email}.` });
        } else {
          setLastInviteUrl(data.inviteUrl);
          setTeamFeedback({
            kind: 'warn',
            msg: 'Email could not be sent — share the link below manually.',
          });
        }
      }
    } finally {
      setInviteBusy(false);
    }
  };

  const handleResendInvite = async (admin: TeamAdmin) => {
    setTeamFeedback(null);
    setLastInviteUrl(null);
    const res = await fetch(`/api/admin/team/${admin.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resendInvite: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTeamFeedback({ kind: 'err', msg: data.error || 'Failed to resend invite.' });
      return;
    }
    fetchTeam();
    if (data.emailSent) {
      setTeamFeedback({ kind: 'ok', msg: `Invite resent to ${admin.email}.` });
    } else {
      setLastInviteUrl(data.inviteUrl);
      setTeamFeedback({
        kind: 'warn',
        msg: 'Email could not be sent — share the link below manually.',
      });
    }
  };

  const handleResetPassword = async (admin: TeamAdmin) => {
    setTeamFeedback(null);
    setLastInviteUrl(null);
    const res = await fetch(`/api/admin/team/${admin.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPassword: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTeamFeedback({ kind: 'err', msg: data.error || 'Failed to reset password.' });
      return;
    }
    fetchTeam();
    if (data.emailSent) {
      setTeamFeedback({ kind: 'ok', msg: `Password reset link emailed to ${admin.email}.` });
    } else {
      setLastInviteUrl(data.inviteUrl);
      setTeamFeedback({
        kind: 'warn',
        msg: 'Email could not be sent — share the reset link below manually.',
      });
    }
  };

  const handleToggleStatus = async (admin: TeamAdmin) => {
    const next = admin.status === 'active' ? 'disabled' : 'active';
    const res = await fetch(`/api/admin/team/${admin.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error || 'Failed to update.');
    fetchTeam();
  };

  const handleRemoveAdmin = async (admin: TeamAdmin) => {
    if (!confirm(`Remove ${admin.email} from the admin team?`)) return;
    const res = await fetch(`/api/admin/team/${admin.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) alert(data.error || 'Failed to remove.');
    fetchTeam();
  };

  const copyInviteUrl = () => {
    if (!lastInviteUrl) return;
    navigator.clipboard.writeText(lastInviteUrl).catch(() => {});
  };

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/training/templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      const res = await fetch('/api/training/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, description: formDesc || null }),
      });
      if (res.ok) {
        setFormName('');
        setFormDesc('');
        setShowCreate(false);
        fetchTemplates();
      }
    } catch (err) {
      console.error('Failed to create template:', err);
    }
  };

  const handleUpdate = async () => {
    if (!editingTemplate || !formName.trim()) return;
    try {
      const res = await fetch(`/api/training/templates/${editingTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, description: formDesc || null }),
      });
      if (res.ok) {
        setEditingTemplate(null);
        setFormName('');
        setFormDesc('');
        fetchTemplates();
      }
    } catch (err) {
      console.error('Failed to update template:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/training/templates/${id}`, { method: 'DELETE' });
      fetchTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const handleFileUpload = async (templateId: string, file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
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
            fileData: base64,
            fileSize: file.size,
            templateId,
          }),
        });
        setUploading(false);
        fetchTemplates();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload file:', err);
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await fetch(`/api/training/files/${fileId}`, { method: 'DELETE' });
      fetchTemplates();
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf': return '📄';
      case 'video': return '🎥';
      case 'image': return '🖼️';
      default: return '📎';
    }
  };

  const handleLanguageChange = (newLang: 'fr' | 'en') => {
    setLang(newLang);
    setLangSaved(true);
    setTimeout(() => setLangSaved(false), 2000);
  };

  return (
    <div>
      <PageHeader title={t('settings', 'title')} />

      {/* Language Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{t('settings', 'languageSection')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('settings', 'languageDesc')}</p>
        </div>
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={() => handleLanguageChange('fr')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${lang === 'fr' ? 'bg-brand-600 text-white font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Français
          </button>
          <button
            onClick={() => handleLanguageChange('en')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${lang === 'en' ? 'bg-brand-600 text-white font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            English
          </button>
          {langSaved && (
            <span className="text-sm text-green-600 ml-2">{t('settings', 'languageSaved')}</span>
          )}
        </div>
      </div>

      {/* Team / Admins Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Team</h2>
            <p className="text-sm text-gray-500 mt-1">
              Invite people to join the admin team. They&apos;ll get a link to set their password.
            </p>
          </div>
          <button
            onClick={() => { setShowInvite((v) => !v); setInviteError(null); setLastInviteUrl(null); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            {showInvite ? 'Cancel' : 'Invite admin'}
          </button>
        </div>

        {showInvite && (
          <div className="p-4 bg-blue-50 border-b border-blue-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Full name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {inviteError && <p className="text-sm text-red-600 mt-2">{inviteError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInvite}
                disabled={inviteBusy}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {inviteBusy ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        )}

        {teamFeedback && (
          <div
            className={`p-3 text-sm border-b ${
              teamFeedback.kind === 'ok'
                ? 'bg-green-50 border-green-100 text-green-800'
                : teamFeedback.kind === 'warn'
                ? 'bg-amber-50 border-amber-100 text-amber-800'
                : 'bg-red-50 border-red-100 text-red-800'
            }`}
          >
            {teamFeedback.msg}
          </div>
        )}

        {lastInviteUrl && (
          <div className="p-4 bg-amber-50 border-b border-amber-100">
            <p className="text-sm text-amber-800 mb-2">
              Fallback link (valid 48h). Share this with the user manually:
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={lastInviteUrl}
                className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-xs bg-white font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={copyInviteUrl}
                className="px-3 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {teamLoading ? (
            <div className="p-8 text-center text-gray-400">{t('common', 'loading')}</div>
          ) : team.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No admins yet.</div>
          ) : (
            team.map((admin) => {
              const isSelf = admin.id === currentUserId;
              const statusColor =
                admin.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : admin.status === 'invited'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-200 text-gray-600';
              return (
                <div key={admin.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">{admin.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor}`}>
                        {admin.status}
                      </span>
                      {isSelf && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{admin.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {admin.status === 'invited' && (
                      <HoldButton
                        color="blue"
                        label="Send invite again"
                        activeLabel="Hold to confirm…"
                        doneLabel="Sent!"
                        onConfirm={() => handleResendInvite(admin)}
                      />
                    )}
                    {admin.status === 'active' && (
                      <HoldButton
                        color="red"
                        label="Reset password"
                        activeLabel="Hold to confirm…"
                        doneLabel="Email sent!"
                        onConfirm={() => handleResetPassword(admin)}
                      />
                    )}
                    {admin.status !== 'invited' && !isSelf && (
                      <button
                        onClick={() => handleToggleStatus(admin)}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
                      >
                        {admin.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                    {!isSelf && (
                      <button
                        onClick={() => handleRemoveAdmin(admin)}
                        className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-red-600 rounded"
                        title="Remove from admin team"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Training Templates Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{t('settings', 'trainingTemplates')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('settings', 'trainingTemplatesDesc')}</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditingTemplate(null); setFormName(''); setFormDesc(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            {t('settings', 'newTemplate')}
          </button>
        </div>

        {/* Create / Edit Form */}
        {(showCreate || editingTemplate) && (
          <div className="p-4 bg-blue-50 border-b border-blue-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {editingTemplate ? t('settings', 'editTemplate') : t('settings', 'newTemplateForm')}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder={t('settings', 'templateName')}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <textarea
                placeholder={t('settings', 'descriptionOptional')}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              {/* Files — only in edit mode */}
              {editingTemplate && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('settings', 'attachedFiles')}</label>
                  {editingTemplate.files.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {editingTemplate.files.map((file) => (
                        <div key={file.id} className="flex items-center justify-between bg-white rounded px-3 py-1.5 text-sm border border-gray-200">
                          <div className="flex items-center gap-2">
                            <span>{getFileIcon(file.fileType)}</span>
                            <span className="text-gray-700">{file.name}</span>
                            <span className="text-gray-400 text-xs">{formatFileSize(file.fileSize)}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            className="text-gray-400 hover:text-red-500 text-xs"
                          >
                            {t('common', 'remove')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 cursor-pointer">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {uploading ? t('common', 'uploading') : t('settings', 'attachFile')}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUpload(editingTemplate.id, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={editingTemplate ? handleUpdate : handleCreate}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                >
                  {editingTemplate ? t('common', 'save') : t('settings', 'createTemplate')}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setEditingTemplate(null); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                >
                  {t('common', 'cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template List */}
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 text-center text-gray-400">{t('common', 'loading')}</div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {t('settings', 'noTemplates')}
            </div>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{template.name}</h3>
                    {template.description && (
                      <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>{template.files.length} {t('settings', 'files')}</span>
                      <span>{template.events.length} {t('settings', 'events')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => {
                        setEditingTemplate(template);
                        setFormName(template.name);
                        setFormDesc(template.description || '');
                        setShowCreate(false);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      title={t('common', 'edit')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      title={t('common', 'delete')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

              </div>
            ))
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          VISIT SIDEBAR — Configure which QB inventory categories show in visits
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{t('settings', 'visitSidebarTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('settings', 'visitSidebarDesc')}</p>
        </div>
        <VisitSidebarSettings t={t} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ADD STOCK — Create inventory items in QuickBooks
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{t('settings', 'addStockTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('settings', 'addStockDesc')}</p>
        </div>
        <AddStockForm t={t} />
      </div>
    </div>
  );
}

// ── Visit Sidebar Settings sub-component ──
function VisitSidebarSettings({ t }: { t: (s: string, k: string) => string }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');
  const [qbItems, setQbItems] = useState<{ id: string; name: string; type: string }[]>([]);
  const [qbConnected, setQbConnected] = useState(false);
  const [loadingQb, setLoadingQb] = useState(true);
  const [saved, setSaved] = useState(false);

  // Load saved categories from localStorage (will move to DB later)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('visitSidebarCategories');
      if (stored) setCategories(JSON.parse(stored));
    } catch {}
  }, []);

  // Fetch QB inventory items
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/quickbooks/inventory');
        const data = await res.json();
        setQbConnected(data.connected ?? false);
        setQbItems(data.items || []);
      } catch {}
      setLoadingQb(false);
    })();
  }, []);

  const saveCategories = (cats: string[]) => {
    setCategories(cats);
    try { localStorage.setItem('visitSidebarCategories', JSON.stringify(cats)); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAdd = () => {
    if (!newCat.trim() || categories.includes(newCat.trim())) return;
    saveCategories([...categories, newCat.trim()]);
    setNewCat('');
  };

  const handleRemove = (cat: string) => saveCategories(categories.filter(c => c !== cat));

  // Unique QB categories/types for suggestions
  const qbCategories = Array.from(new Set(qbItems.map(i => i.type).filter(Boolean)));

  return (
    <div className="p-6 space-y-4">
      {!qbConnected && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          {t('liveVisits', 'notConnected')} — {t('settings', 'visitSidebarDesc')}
        </div>
      )}

      {/* Current categories */}
      {categories.length === 0 ? (
        <p className="text-sm text-gray-400">{t('settings', 'visitSidebarEmpty')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium">
              {cat}
              <button onClick={() => handleRemove(cat)} className="text-brand-400 hover:text-red-500 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add new */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('settings', 'visitSidebarAdd')}
          list="qb-category-suggestions"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        />
        <datalist id="qb-category-suggestions">
          {qbCategories.map(c => <option key={c} value={c} />)}
          {qbItems.slice(0, 50).map(i => <option key={i.id} value={i.name} />)}
        </datalist>
        <button
          onClick={handleAdd}
          disabled={!newCat.trim()}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-30 text-white text-sm font-medium rounded-lg transition-colors"
        >
          +
        </button>
      </div>

      {saved && (
        <p className="text-xs text-green-600 font-medium">{t('settings', 'visitSidebarSaved')}</p>
      )}
    </div>
  );
}

// ── Add Stock — Create QuickBooks inventory items ──
interface QBAccount {
  id: string;
  name: string;
  fullName: string;
  type: string;
  subType: string;
  classification: string;
}

function AddStockForm({ t }: { t: (s: string, k: string) => string }) {
  const [itemType, setItemType] = useState<'Inventory' | 'NonInventory' | 'Service'>('Inventory');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [qtyOnHand, setQtyOnHand] = useState('0');
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [assetAccountId, setAssetAccountId] = useState('');

  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [qbConnected, setQbConnected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch QB accounts on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/quickbooks/accounts');
        const data = await res.json();
        setQbConnected(data.connected ?? false);
        setAccounts(data.accounts || []);
      } catch {}
      setLoadingAccounts(false);
    })();
  }, []);

  // Filter accounts by classification/type for dropdowns
  const incomeAccounts = accounts.filter(a => a.classification === 'Revenue' || a.type === 'Income');
  const expenseAccounts = accounts.filter(a =>
    a.type === 'Cost of Goods Sold' || a.classification === 'Expense' || a.type === 'Expense'
  );
  const assetAccounts = accounts.filter(a =>
    a.classification === 'Asset' || a.type === 'Other Current Asset'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/quickbooks/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: itemType,
          description: description.trim() || null,
          sku: sku.trim() || null,
          unitPrice: unitPrice ? parseFloat(unitPrice) : null,
          purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
          qtyOnHand: qtyOnHand ? parseInt(qtyOnHand, 10) : 0,
          incomeAccountId: incomeAccountId || null,
          expenseAccountId: expenseAccountId || null,
          assetAccountId: assetAccountId || null,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: `"${data.item?.name || name}" created in QuickBooks` });
        // Reset form
        setName(''); setDescription(''); setSku(''); setUnitPrice(''); setPurchaseCost(''); setQtyOnHand('0');
      } else {
        setResult({ success: false, message: data.error || 'Failed to create item' });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Network error' });
    }
    setSubmitting(false);
  };

  if (loadingAccounts) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (!qbConnected) {
    return (
      <div className="p-6">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          {t('liveVisits', 'notConnected')}
        </div>
      </div>
    );
  }

  const isInventory = itemType === 'Inventory';

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">

      {/* Type selector */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('settings', 'stockType')}</label>
        <p className="text-xs text-gray-400 mb-2">{t('settings', 'stockTypeHint')}</p>
        <div className="flex gap-2">
          {(['Inventory', 'NonInventory', 'Service'] as const).map(tp => (
            <button
              key={tp}
              type="button"
              onClick={() => setItemType(tp)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                itemType === tp
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tp === 'Inventory' ? t('settings', 'stockInventory')
                : tp === 'NonInventory' ? t('settings', 'stockNonInventory')
                : t('settings', 'stockService')}
            </button>
          ))}
        </div>
      </div>

      {/* Name (required) */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockName')} *</label>
        <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockNameHint')}</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Ex: UR10e Cobot, Laser Head 50W..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockDescription')}</label>
        <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockDescHint')}</p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Ex: Universal Robots UR10e collaborative robot arm with teach pendant"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
        />
      </div>

      {/* SKU + Prices row */}
      <div className="grid grid-cols-3 gap-4">
        {/* SKU */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockSku')}</label>
          <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockSkuHint')}</p>
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="UR10E-001"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>

        {/* Selling price */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockPrice')}</label>
          <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockPriceHint')}</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>

        {/* Purchase cost */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockCost')}</label>
          <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockCostHint')}</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={purchaseCost}
            onChange={(e) => setPurchaseCost(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Qty on hand — Inventory only */}
      {isInventory && (
        <div className="max-w-[200px]">
          <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockQty')}</label>
          <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockQtyHint')}</p>
          <input
            type="number"
            min="0"
            value={qtyOnHand}
            onChange={(e) => setQtyOnHand(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
      )}

      {/* ── QB Accounts ── */}
      <div className="border-t border-gray-100 pt-5">
        <p className="text-sm font-bold text-gray-700 mb-1">{t('settings', 'stockAccounts')}</p>
        <p className="text-xs text-gray-400 mb-4">{t('settings', 'stockAccountsHint')}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Income account */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {t('settings', 'stockIncomeAccount')} {isInventory ? '*' : ''}
            </label>
            <p className="text-[11px] text-gray-400 mb-1">{t('settings', 'stockIncomeHint')}</p>
            <select
              value={incomeAccountId}
              onChange={(e) => setIncomeAccountId(e.target.value)}
              required={isInventory}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">{t('settings', 'stockSelectAccount')}</option>
              {incomeAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.fullName}</option>
              ))}
            </select>
          </div>

          {/* Expense / COGS account */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {t('settings', 'stockExpenseAccount')} {isInventory ? '*' : ''}
            </label>
            <p className="text-[11px] text-gray-400 mb-1">{t('settings', 'stockExpenseHint')}</p>
            <select
              value={expenseAccountId}
              onChange={(e) => setExpenseAccountId(e.target.value)}
              required={isInventory}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">{t('settings', 'stockSelectAccount')}</option>
              {expenseAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.fullName}</option>
              ))}
            </select>
          </div>

          {/* Asset account — Inventory only */}
          {isInventory && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                {t('settings', 'stockAssetAccount')} *
              </label>
              <p className="text-[11px] text-gray-400 mb-1">{t('settings', 'stockAssetHint')}</p>
              <select
                value={assetAccountId}
                onChange={(e) => setAssetAccountId(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              >
                <option value="">{t('settings', 'stockSelectAccount')}</option>
                {assetAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.fullName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Result message */}
      {result && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          result.success
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {result.message}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {submitting ? t('settings', 'stockCreating') : t('settings', 'stockCreate')}
      </button>
    </form>
  );
}
