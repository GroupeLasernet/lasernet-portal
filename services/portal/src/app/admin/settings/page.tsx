'use client';

import { useState, useEffect, useCallback } from 'react';

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

export default function SettingsPage() {
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TrainingTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [uploading, setUploading] = useState(false);

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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
      </div>

      {/* Training Templates Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Training Templates</h2>
            <p className="text-sm text-gray-500 mt-1">Create reusable training templates with pre-attached files</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditingTemplate(null); setFormName(''); setFormDesc(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + New Template
          </button>
        </div>

        {/* Create / Edit Form */}
        {(showCreate || editingTemplate) && (
          <div className="p-4 bg-blue-50 border-b border-blue-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {editingTemplate ? 'Edit Template' : 'New Template'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Template name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <textarea
                placeholder="Description (optional)"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              {/* Files — only in edit mode */}
              {editingTemplate && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Attached Files</label>
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
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 cursor-pointer">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {uploading ? 'Uploading...' : 'Attach file'}
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
                  {editingTemplate ? 'Save Changes' : 'Create Template'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setEditingTemplate(null); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template List */}
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No templates yet. Create one to get started.
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
                      <span>{template.files.length} file{template.files.length !== 1 ? 's' : ''}</span>
                      <span>{template.events.length} event{template.events.length !== 1 ? 's' : ''}</span>
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
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      title="Delete"
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
