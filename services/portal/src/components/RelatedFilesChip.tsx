'use client';

// ============================================================
// RelatedFilesChip — surfaces every file + video linked to a
// given QuickBooks SKU on quote/invoice line item rows.
// ------------------------------------------------------------
// End goal (Hugo): client calls with a problem → open the invoice
// → click the SKU → see all related videos/files. No manual
// per-quote assignment. The chip is intentionally tiny when
// collapsed (just the count) and expands to a dropdown list on
// click so it doesn't clutter long invoices.
//
// Uses /api/files/by-sku?skuId=... which joins FileAssetSku +
// VideoAssetSku against the supplied QB Item.Id.
// ============================================================

import { useEffect, useRef, useState } from 'react';

interface RelatedDoc {
  id: string;
  name: string;
  driveFileId: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
}

interface RelatedVideo {
  id: string;
  title: string;
  vimeoUrl: string;
  vimeoId: string | null;
  folderId: string | null;
}

export function RelatedFilesChip({ skuId, compact = false }: { skuId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<RelatedDoc[]>([]);
  const [videos, setVideos] = useState<RelatedVideo[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Lazy fetch on first open — we don't want to hit the DB for
  // every line item on every quote/invoice load, only when Hugo
  // actually clicks the chip.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/files/by-sku?skuId=${encodeURIComponent(skuId)}`)
      .then((r) => (r.ok ? r.json() : { documents: [], videos: [] }))
      .then((data) => {
        if (cancelled) return;
        setDocs(data.documents ?? []);
        setVideos(data.videos ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, skuId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const total = docs.length + videos.length;

  // Until the user clicks, we don't know the count. Show a
  // neutral placeholder so the chip takes up consistent space.
  return (
    <div ref={wrapRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-200 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300 ${compact ? '' : 'shadow-sm'}`}
        title="Related files for this SKU"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{loaded ? (total > 0 ? `${total} file${total === 1 ? '' : 's'}` : 'No files') : 'Files'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Loading…</div>
          ) : total === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              No files linked to this SKU yet.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto text-sm">
              {docs.map((d) => (
                <li key={d.id}>
                  <a
                    href={`https://drive.google.com/file/d/${d.driveFileId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >
                    <span className="text-gray-500">📄</span>
                    <span className="truncate text-gray-900 dark:text-gray-100">{d.name}</span>
                  </a>
                </li>
              ))}
              {videos.map((v) => (
                <li key={v.id}>
                  <a
                    href={v.vimeoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >
                    <span className="text-gray-500">🎬</span>
                    <span className="truncate text-gray-900 dark:text-gray-100">{v.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
