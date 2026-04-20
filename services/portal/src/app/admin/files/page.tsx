'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { mockFiles, mockVideos } from '@/lib/mock-data';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

// ── Sort keys ────────────────────────────────────────────────────────────
type DocSort = 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc' | 'size-desc';
type VidSort = 'title-asc' | 'title-desc' | 'date-desc' | 'date-asc';

export default function AdminFilesPage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  const [docSort, setDocSort] = useState<DocSort>('date-desc');
  const [vidSort, setVidSort] = useState<VidSort>('date-desc');

  const sortedFiles = useMemo(() => {
    const list = [...mockFiles];
    list.sort((a, b) => {
      switch (docSort) {
        case 'name-asc':  return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'date-desc': return (b.uploadedAt || '').localeCompare(a.uploadedAt || '');
        case 'date-asc':  return (a.uploadedAt || '').localeCompare(b.uploadedAt || '');
        case 'size-desc': return parseSize(b.size) - parseSize(a.size);
      }
    });
    return list;
  }, [docSort]);

  const sortedVideos = useMemo(() => {
    const list = [...mockVideos];
    list.sort((a, b) => {
      switch (vidSort) {
        case 'title-asc':  return a.title.localeCompare(b.title);
        case 'title-desc': return b.title.localeCompare(a.title);
        case 'date-desc':  return (b.uploadedAt || '').localeCompare(a.uploadedAt || '');
        case 'date-asc':   return (a.uploadedAt || '').localeCompare(b.uploadedAt || '');
      }
    });
    return list;
  }, [vidSort]);

  return (
    <div>
      <PageHeader
        title={t('files', 'title')}
        subtitle={t('files', 'subtitle')}
        actions={
          <button className="btn-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t('files', 'uploadFile')}
          </button>
        }
      />

      {/* Documents */}
      <div className="card mb-6">
        <ContainerHeader
          title={t('files', 'documents')}
          count={sortedFiles.length}
          menuItems={[
            {
              label: fr ? 'Téléverser un document' : 'Upload a document',
              icon: UploadIcon,
              onClick: () => {/* hook up to real upload later */},
            },
            { divider: true },
            {
              label: fr ? 'Trier par nom (A-Z)' : 'Sort by name (A-Z)',
              icon: SortAlphaIcon,
              active: docSort === 'name-asc',
              onClick: () => setDocSort('name-asc'),
            },
            {
              label: fr ? 'Trier par nom (Z-A)' : 'Sort by name (Z-A)',
              icon: SortAlphaIcon,
              active: docSort === 'name-desc',
              onClick: () => setDocSort('name-desc'),
            },
            {
              label: fr ? 'Plus récents d\u2019abord' : 'Newest first',
              icon: SortDateIcon,
              active: docSort === 'date-desc',
              onClick: () => setDocSort('date-desc'),
            },
            {
              label: fr ? 'Plus anciens d\u2019abord' : 'Oldest first',
              icon: SortDateIcon,
              active: docSort === 'date-asc',
              onClick: () => setDocSort('date-asc'),
            },
            {
              label: fr ? 'Plus volumineux d\u2019abord' : 'Largest first',
              icon: SortSizeIcon,
              active: docSort === 'size-desc',
              onClick: () => setDocSort('size-desc'),
            },
          ]}
        />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('files', 'fileName')}</th>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common', 'type')}</th>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common', 'size')}</th>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('files', 'category')}</th>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('files', 'uploaded')}</th>
                <th className="text-right pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common', 'actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {sortedFiles.map((file) => (
                <tr key={file.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="font-medium text-sm">{file.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-gray-600 dark:text-gray-400">{file.type}</td>
                  <td className="py-3 text-sm text-gray-600 dark:text-gray-400">{file.size}</td>
                  <td className="py-3">
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">{file.category}</span>
                  </td>
                  <td className="py-3 text-sm text-gray-500 dark:text-gray-400">{file.uploadedAt}</td>
                  <td className="py-3 text-right">
                    <button className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 text-sm font-medium mr-3">{t('common', 'edit')}</button>
                    <button className="text-red-500 hover:text-red-600 text-sm font-medium">{t('common', 'delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Videos */}
      <div className="card">
        <ContainerHeader
          title={t('files', 'videos')}
          count={sortedVideos.length}
          menuItems={[
            {
              label: fr ? 'Téléverser une vidéo' : 'Upload a video',
              icon: UploadIcon,
              onClick: () => {/* hook up to real upload later */},
            },
            { divider: true },
            {
              label: fr ? 'Trier par titre (A-Z)' : 'Sort by title (A-Z)',
              icon: SortAlphaIcon,
              active: vidSort === 'title-asc',
              onClick: () => setVidSort('title-asc'),
            },
            {
              label: fr ? 'Trier par titre (Z-A)' : 'Sort by title (Z-A)',
              icon: SortAlphaIcon,
              active: vidSort === 'title-desc',
              onClick: () => setVidSort('title-desc'),
            },
            {
              label: fr ? 'Plus récents d\u2019abord' : 'Newest first',
              icon: SortDateIcon,
              active: vidSort === 'date-desc',
              onClick: () => setVidSort('date-desc'),
            },
            {
              label: fr ? 'Plus anciens d\u2019abord' : 'Oldest first',
              icon: SortDateIcon,
              active: vidSort === 'date-asc',
              onClick: () => setVidSort('date-asc'),
            },
          ]}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedVideos.map((video) => (
            <div key={video.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-md dark:shadow-gray-900/50 transition-shadow">
              <div className="aspect-video bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="p-4">
                <h3 className="font-medium text-sm">{video.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{video.category} • {video.uploadedAt}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Container header with kebab menu ────────────────────────────────────

type MenuItem =
  | { divider: true }
  | {
      label: string;
      icon?: (props: { className?: string }) => JSX.Element;
      onClick: () => void;
      active?: boolean;
    };

function ContainerHeader({
  title,
  count,
  menuItems,
}: {
  title: string;
  count: number;
  menuItems: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the menu when the user clicks outside it.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        {title}
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{count}</span>
      </h2>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 14a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
          </svg>
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-60 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20"
          >
            {menuItems.map((item, i) =>
              'divider' in item ? (
                <div key={`div-${i}`} className="my-1 border-t border-gray-100 dark:border-gray-700" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => { item.onClick(); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    item.active
                      ? 'text-brand-600 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 font-medium'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {item.icon && <item.icon className="w-4 h-4 flex-shrink-0" />}
                  <span className="truncate">{item.label}</span>
                  {item.active && (
                    <svg className="w-4 h-4 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Menu icons ───────────────────────────────────────────────────────────

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}
function SortAlphaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h13M3 12h9m-9 6h5m6-6v8m0 0l-3-3m3 3l3-3" />
    </svg>
  );
}
function SortDateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function SortSizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h12M4 18h8" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

// Parse a size string like "2.4 MB" / "890 KB" into bytes for sort comparison.
function parseSize(s: string | null | undefined): number {
  if (!s) return 0;
  const m = /([\d.]+)\s*(KB|MB|GB|TB|B)?/i.exec(s);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'B').toUpperCase();
  const mult = unit === 'KB' ? 1024 :
               unit === 'MB' ? 1024 ** 2 :
               unit === 'GB' ? 1024 ** 3 :
               unit === 'TB' ? 1024 ** 4 : 1;
  return n * mult;
}
