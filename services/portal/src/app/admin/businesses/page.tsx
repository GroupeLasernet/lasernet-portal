'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

// ── Types ────────────────────────────────────────────────────────────────────

interface LocalBusiness {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { visitGroups: number; leads: number };
}

interface VisitGroup {
  id: string;
  businessId: string | null;
  visitedAt: string;
  notes: string | null;
  visitors: { id: string; name: string; email: string | null }[];
}

interface VisitFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  uploadedAt: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminBusinessesPage() {
  const { t } = useLanguage();

  // ── Data state ──
  const [businesses, setBusinesses] = useState<LocalBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Search ──
  const [search, setSearch] = useState('');

  // ── Detail panel state ──
  const [detailName, setDetailName] = useState('');
  const [detailAddress, setDetailAddress] = useState('');
  const [detailCity, setDetailCity] = useState('');
  const [detailProvince, setDetailProvince] = useState('');
  const [detailPostalCode, setDetailPostalCode] = useState('');
  const [detailCountry, setDetailCountry] = useState('');
  const [detailPhone, setDetailPhone] = useState('');
  const [detailEmail, setDetailEmail] = useState('');
  const [detailWebsite, setDetailWebsite] = useState('');
  const [detailNotes, setDetailNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Detail sub-data ──
  const [visitGroups, setVisitGroups] = useState<VisitGroup[]>([]);
  const [files, setFiles] = useState<VisitFile[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── New business modal ──
  const [showNewBusiness, setShowNewBusiness] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', address: '', city: '', province: '', postalCode: '', country: '', phone: '', email: '', website: '', notes: '' });
  const [newSaving, setNewSaving] = useState(false);

  // ── Mobile detail overlay ──
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // ── Derived ──
  const selectedBusiness = businesses.find(b => b.id === selectedId) ?? null;

  // ── Fetch businesses ──
  const fetchBusinesses = async () => {
    try {
      const res = await fetch('/api/local-businesses');
      const data = await res.json();
      if (data.businesses) setBusinesses(data.businesses);
      else if (Array.isArray(data)) setBusinesses(data);
    } catch { /* silently fail */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchBusinesses();
  }, []);

  // ── When selected business changes, populate detail fields ──
  useEffect(() => {
    if (selectedBusiness) {
      setDetailName(selectedBusiness.name || '');
      setDetailAddress(selectedBusiness.address || '');
      setDetailCity(selectedBusiness.city || '');
      setDetailProvince(selectedBusiness.province || '');
      setDetailPostalCode(selectedBusiness.postalCode || '');
      setDetailCountry(selectedBusiness.country || '');
      setDetailPhone(selectedBusiness.phone || '');
      setDetailEmail(selectedBusiness.email || '');
      setDetailWebsite(selectedBusiness.website || '');
      setDetailNotes(selectedBusiness.notes || '');
      loadDetailData(selectedBusiness.id);
      setMobileDetailOpen(true);
    }
  }, [selectedId]);

  // ── Load visit groups + files for selected business ──
  const loadDetailData = async (businessId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/local-businesses/${businessId}`);
      const data = await res.json();
      setVisitGroups(data.visitGroups ?? data.business?.visitGroups ?? []);
      setFiles(data.files ?? data.business?.files ?? []);
    } catch { /* silently fail */ }
    setDetailLoading(false);
  };

  // ── Filtered businesses ──
  const filtered = businesses.filter(b => {
    if (search) {
      const q = search.toLowerCase();
      return b.name.toLowerCase().includes(q);
    }
    return true;
  });

  // ── Save business detail ──
  const handleSave = async () => {
    if (!selectedBusiness) return;
    setSaving(true);
    try {
      await fetch(`/api/local-businesses/${selectedBusiness.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: detailName,
          address: detailAddress || null,
          city: detailCity || null,
          province: detailProvince || null,
          postalCode: detailPostalCode || null,
          country: detailCountry || null,
          phone: detailPhone || null,
          email: detailEmail || null,
          website: detailWebsite || null,
          notes: detailNotes || null,
        }),
      });
      await fetchBusinesses();
    } catch { /* silently fail */ }
    setSaving(false);
  };

  // ── Create new business ──
  const handleCreateBusiness = async () => {
    setNewSaving(true);
    try {
      const res = await fetch('/api/local-businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newForm.name,
          address: newForm.address || null,
          city: newForm.city || null,
          province: newForm.province || null,
          postalCode: newForm.postalCode || null,
          country: newForm.country || null,
          phone: newForm.phone || null,
          email: newForm.email || null,
          website: newForm.website || null,
          notes: newForm.notes || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewBusiness(false);
        setNewForm({ name: '', address: '', city: '', province: '', postalCode: '', country: '', phone: '', email: '', website: '', notes: '' });
        await fetchBusinesses();
        const id = data.business?.id ?? data.id;
        if (id) setSelectedId(id);
      }
    } catch { /* silently fail */ }
    setNewSaving(false);
  };

  // ── Format helpers ──
  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── LEFT PANEL ────────────────────────────────────────────────────── */}
      <div className={`flex flex-col border-r bg-white dark:bg-gray-800 transition-all duration-200 ${
        selectedBusiness ? 'hidden md:flex md:w-1/2 xl:w-2/5' : 'w-full'
      }`}>
        <div className="p-4 sm:p-6 border-b">
          <PageHeader
            title={t('businesses', 'title')}
            subtitle={t('businesses', 'subtitle')}
            actions={
              <button
                onClick={() => setShowNewBusiness(true)}
                className="btn-primary flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('businesses', 'newBusiness')}
              </button>
            }
          />

          {/* Search */}
          <input
            type="text"
            placeholder={t('businesses', 'searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
          />
        </div>

        {/* Business list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-16 text-sm">{t('businesses', 'noBusinesses')}</div>
          ) : (
            <div className="divide-y">
              {filtered.map(biz => (
                <button
                  key={biz.id}
                  onClick={() => setSelectedId(biz.id)}
                  className={`w-full text-left px-4 sm:px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition ${
                    selectedId === biz.id ? 'bg-brand-50 dark:bg-brand-900/30 border-l-4 border-brand-600' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{biz.name}</p>
                      {biz.address && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                          {[biz.address, biz.city, biz.province].filter(Boolean).join(', ')}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {biz.phone && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                            {biz.phone}
                          </span>
                        )}
                        {biz.email && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 truncate">{biz.email}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                        {(biz._count?.visitGroups ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5" title={t('businesses', 'visits')}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {biz._count?.visitGroups}
                          </span>
                        )}
                        {(biz._count?.leads ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5" title={t('businesses', 'leads')}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {biz._count?.leads}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────── */}
      {selectedBusiness ? (
        <div className={`flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 ${
          mobileDetailOpen ? 'fixed inset-0 z-40 md:static md:z-auto' : 'hidden md:block'
        }`}>
          <div className="p-4 sm:p-6 space-y-6">

            {/* Business header */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold text-brand-700 dark:text-brand-300">
                    {selectedBusiness.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedBusiness.name}</h2>
                  {selectedBusiness.address && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5">
                      {[selectedBusiness.address, selectedBusiness.city, selectedBusiness.province, selectedBusiness.postalCode].filter(Boolean).join(', ')}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 flex-wrap">
                    {selectedBusiness.email && (
                      <a href={`mailto:${selectedBusiness.email}`} className="hover:text-brand-600 dark:hover:text-brand-400 dark:text-brand-400 transition truncate">{selectedBusiness.email}</a>
                    )}
                    {selectedBusiness.phone && (
                      <a href={`tel:${selectedBusiness.phone}`} className="hover:text-brand-600 dark:hover:text-brand-400 dark:text-brand-400 transition">{selectedBusiness.phone}</a>
                    )}
                    {selectedBusiness.website && (
                      <a href={selectedBusiness.website} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 dark:hover:text-brand-400 dark:text-brand-400 transition truncate">{selectedBusiness.website}</a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedId(null); setMobileDetailOpen(false); }}
                  className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 dark:text-gray-400 dark:text-gray-500 transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Editable fields */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('businesses', 'editDetails')}</h3>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'name')}</label>
                <input
                  type="text"
                  value={detailName}
                  onChange={e => setDetailName(e.target.value)}
                  className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'address')}</label>
                <input
                  type="text"
                  value={detailAddress}
                  onChange={e => setDetailAddress(e.target.value)}
                  className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'city')}</label>
                  <input
                    type="text"
                    value={detailCity}
                    onChange={e => setDetailCity(e.target.value)}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'province')}</label>
                  <input
                    type="text"
                    value={detailProvince}
                    onChange={e => setDetailProvince(e.target.value)}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'postalCode')}</label>
                  <input
                    type="text"
                    value={detailPostalCode}
                    onChange={e => setDetailPostalCode(e.target.value)}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'country')}</label>
                  <input
                    type="text"
                    value={detailCountry}
                    onChange={e => setDetailCountry(e.target.value)}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'phone')}</label>
                  <input
                    type="tel"
                    value={detailPhone}
                    onChange={e => setDetailPhone(e.target.value)}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'email')}</label>
                  <input
                    type="email"
                    value={detailEmail}
                    onChange={e => setDetailEmail(e.target.value)}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'website')}</label>
                <input
                  type="url"
                  value={detailWebsite}
                  onChange={e => setDetailWebsite(e.target.value)}
                  placeholder="https://"
                  className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'notes')}</label>
                <textarea
                  value={detailNotes}
                  onChange={e => setDetailNotes(e.target.value)}
                  rows={3}
                  className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
                >
                  {saving ? t('businesses', 'saving') : t('businesses', 'save')}
                </button>
              </div>
            </div>

            {/* Visit history */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('businesses', 'visitHistory')}</h3>
              {detailLoading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
                </div>
              ) : visitGroups.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">{t('businesses', 'noVisits')}</p>
              ) : (
                <div className="space-y-3">
                  {visitGroups.map(vg => (
                    <div key={vg.id} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {vg.visitors?.map(v => v.name).join(', ') || t('businesses', 'unknownVisitor')}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(vg.visitedAt)}</span>
                      </div>
                      {vg.notes && <p className="text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500 mt-1">{vg.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Files section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('businesses', 'files')}</h3>
              {detailLoading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
                </div>
              ) : files.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">{t('businesses', 'noFiles')}</p>
              ) : (
                <div className="space-y-2">
                  {files.map(file => (
                    <a
                      key={file.id}
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-700 transition"
                    >
                      <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{file.fileName}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(file.uploadedAt)}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* No business selected */
        <div className="flex-1 hidden md:flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <p className="text-gray-400 dark:text-gray-500 text-sm">{t('businesses', 'selectBusiness')}</p>
        </div>
      )}

      {/* ── New Business Modal ─────────────────────────────────────────────── */}
      {showNewBusiness && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('businesses', 'newBusiness')}</h3>
              <button onClick={() => setShowNewBusiness(false)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 dark:text-gray-400 dark:text-gray-500 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'name')} *</label>
                <input
                  type="text"
                  value={newForm.name}
                  onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                  className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'address')}</label>
                <input
                  type="text"
                  value={newForm.address}
                  onChange={e => setNewForm({ ...newForm, address: e.target.value })}
                  className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'city')}</label>
                  <input
                    type="text"
                    value={newForm.city}
                    onChange={e => setNewForm({ ...newForm, city: e.target.value })}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'province')}</label>
                  <input
                    type="text"
                    value={newForm.province}
                    onChange={e => setNewForm({ ...newForm, province: e.target.value })}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'postalCode')}</label>
                  <input
                    type="text"
                    value={newForm.postalCode}
                    onChange={e => setNewForm({ ...newForm, postalCode: e.target.value })}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'country')}</label>
                  <input
                    type="text"
                    value={newForm.country}
                    onChange={e => setNewForm({ ...newForm, country: e.target.value })}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'phone')}</label>
                  <input
                    type="tel"
                    value={newForm.phone}
                    onChange={e => setNewForm({ ...newForm, phone: e.target.value })}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'email')}</label>
                  <input
                    type="email"
                    value={newForm.email}
                    onChange={e => setNewForm({ ...newForm, email: e.target.value })}
                    className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'website')}</label>
                <input
                  type="url"
                  value={newForm.website}
                  onChange={e => setNewForm({ ...newForm, website: e.target.value })}
                  placeholder="https://"
                  className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">{t('businesses', 'notes')}</label>
                <textarea
                  value={newForm.notes}
                  onChange={e => setNewForm({ ...newForm, notes: e.target.value })}
                  rows={3}
                  className="input-field w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setShowNewBusiness(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition"
              >
                {t('businesses', 'cancel')}
              </button>
              <button
                onClick={handleCreateBusiness}
                disabled={newSaving || !newForm.name.trim()}
                className="btn-primary px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition disabled:opacity-50"
              >
                {newSaving ? t('businesses', 'saving') : t('businesses', 'create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
