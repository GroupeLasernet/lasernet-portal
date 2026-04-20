'use client';

// ============================================================
// CarriedOverMeetings — panel that surfaces any VisitGroup or
// ProjectMeeting that wasn't finalized before the day rolled
// over. Each item is clickable and reopens the EndVisitModal
// seeded with its own context.
//
// Dropped into the Visits tab of Leads so it's obvious the
// moment the operator opens Visits in the morning.
//
// Added 2026-04-20.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import EndVisitModal from './EndVisitModal';

interface CarriedItem {
  kind: 'visitGroup' | 'meeting';
  id: string;
  title: string;
  startedAt: string;
  peopleCount: number;
  peoplePreview: string[];
}

export default function CarriedOverMeetings() {
  const [items, setItems] = useState<CarriedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEntry, setActiveEntry] = useState<
    | { kind: 'visitGroup'; id: string }
    | { kind: 'meeting'; id: string }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/visit-groups/carried-over', { cache: 'no-store' });
      const data = await res.json();
      setItems(data.items || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <>
      <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
            Carried over ({items.length})
          </h4>
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            left unfinished before today
          </span>
        </div>
        <div className="space-y-2">
          {items.map((it) => (
            <button
              key={`${it.kind}-${it.id}`}
              type="button"
              onClick={() => setActiveEntry({ kind: it.kind, id: it.id })}
              className="w-full text-left p-2 rounded-md bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {it.title}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {it.peopleCount} {it.peopleCount === 1 ? 'person' : 'people'}
                    {it.peoplePreview.length > 0 && `: ${it.peoplePreview.join(', ')}`}
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {new Date(it.startedAt).toLocaleDateString()}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {activeEntry && (
        <EndVisitModal
          entry={activeEntry}
          onClose={() => setActiveEntry(null)}
          onFinished={() => { setActiveEntry(null); load(); }}
        />
      )}
    </>
  );
}
