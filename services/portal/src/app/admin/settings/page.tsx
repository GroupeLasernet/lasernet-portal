'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import HoldButton from '@/components/HoldButton';

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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('settings', 'title')}</h1>
      </div>

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
                        color="amber"
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
                        className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
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
    </div>
  );
}
