'use client';

import { useMemo, useState } from 'react';
import { mockFiles, mockVideos } from '@/lib/mock-data';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

// ── Filter dropdowns next to each container title ────────────────────────
// Hugo asked (2026-04-19) for two real dropdowns — Category + Sub-category —
// beside each container title. The sub-category options narrow to whatever
// matches the currently selected category. "All" clears the filter.

const ALL = '__all__';

interface Filterable {
  category: string;
  subCategory: string;
}

function useFiltered<T extends Filterable>(
  items: readonly T[],
  cat: string,
  sub: string,
): T[] {
  return useMemo(
    () =>
      items.filter((i) => {
        if (cat !== ALL && i.category !== cat) return false;
        if (sub !== ALL && i.subCategory !== sub) return false;
        return true;
      }),
    [items, cat, sub],
  );
}

export default function AdminFilesPage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  const [docCat, setDocCat] = useState(ALL);
  const [docSub, setDocSub] = useState(ALL);
  const [vidCat, setVidCat] = useState(ALL);
  const [vidSub, setVidSub] = useState(ALL);

  const filteredFiles = useFiltered(mockFiles, docCat, docSub);
  const filteredVideos = useFiltered(mockVideos, vidCat, vidSub);

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
          count={filteredFiles.length}
          totalCount={mockFiles.length}
          items={mockFiles}
          cat={docCat}
          setCat={setDocCat}
          sub={docSub}
          setSub={setDocSub}
          fr={fr}
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
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                    {fr ? 'Aucun document ne correspond aux filtres.' : 'No documents match the filters.'}
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => (
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">{file.category}</span>
                        {file.subCategory && (
                          <span className="text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-1 rounded-full">{file.subCategory}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-sm text-gray-500 dark:text-gray-400">{file.uploadedAt}</td>
                    <td className="py-3 text-right">
                      <button className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 text-sm font-medium mr-3">{t('common', 'edit')}</button>
                      <button className="text-red-500 hover:text-red-600 text-sm font-medium">{t('common', 'delete')}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Videos */}
      <div className="card">
        <ContainerHeader
          title={t('files', 'videos')}
          count={filteredVideos.length}
          totalCount={mockVideos.length}
          items={mockVideos}
          cat={vidCat}
          setCat={setVidCat}
          sub={vidSub}
          setSub={setVidSub}
          fr={fr}
        />
        {filteredVideos.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
            {fr ? 'Aucune vidéo ne correspond aux filtres.' : 'No videos match the filters.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVideos.map((video) => (
              <div key={video.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-md dark:shadow-gray-900/50 transition-shadow">
                <div className="aspect-video bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="p-4">
                  <h3 className="font-medium text-sm">{video.title}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {video.category}
                    {video.subCategory ? ` • ${video.subCategory}` : ''}
                    {' • '}
                    {video.uploadedAt}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Container header with Category + Sub-category dropdowns ─────────────

function ContainerHeader<T extends Filterable>({
  title,
  count,
  totalCount,
  items,
  cat,
  setCat,
  sub,
  setSub,
  fr,
}: {
  title: string;
  count: number;
  totalCount: number;
  items: readonly T[];
  cat: string;
  setCat: (v: string) => void;
  sub: string;
  setSub: (v: string) => void;
  fr: boolean;
}) {
  // Category options: every unique category present in the dataset.
  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(),
    [items],
  );

  // Sub-category options: when a category is selected, narrow to that slice.
  // When "All" is selected, show every sub-category across everything.
  const subCategories = useMemo(() => {
    const source = cat === ALL ? items : items.filter((i) => i.category === cat);
    return Array.from(new Set(source.map((i) => i.subCategory).filter(Boolean))).sort();
  }, [items, cat]);

  const filtered = cat !== ALL || sub !== ALL;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        {title}
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
          {filtered ? `${count}/${totalCount}` : totalCount}
        </span>
      </h2>

      {/* Category dropdown */}
      <FilterSelect
        label={fr ? 'Catégorie' : 'Category'}
        value={cat}
        onChange={(v) => {
          setCat(v);
          // Clear sub-category when switching category so we never land on a
          // filter that has no matches (e.g. Documentation + Backup).
          setSub(ALL);
        }}
        allLabel={fr ? 'Toutes' : 'All'}
        options={categories}
      />

      {/* Sub-category dropdown */}
      <FilterSelect
        label={fr ? 'Sous-catégorie' : 'Sub-category'}
        value={sub}
        onChange={setSub}
        allLabel={fr ? 'Toutes' : 'All'}
        options={subCategories}
        disabled={subCategories.length === 0}
      />

      {filtered && (
        <button
          type="button"
          onClick={() => {
            setCat(ALL);
            setSub(ALL);
          }}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 underline underline-offset-2"
        >
          {fr ? 'Effacer' : 'Clear'}
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
