// One-time cleanup: remove duplicate VisitNeed entries created by the old
// onBlur bug that POSTed new needs instead of PATCHing notes.
// Duplicates have descriptions like "Manuels: sometext" — the colon pattern.
// Also: entries that are exact duplicates of another entry's type (same group,
// same type/description, where one has notes and the other is the bare duplicate).

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    // 1. Find needs whose description contains ": " (the bugged format "Type: notetext")
    const allNeeds = await prisma.visitNeed.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const toDelete: string[] = [];

    // Group needs by visitGroupId
    const grouped: Record<string, typeof allNeeds> = {};
    for (const n of allNeeds) {
      const gid = n.visitGroupId;
      if (!grouped[gid]) grouped[gid] = [];
      grouped[gid].push(n);
    }

    for (const [, needs] of Object.entries(grouped)) {
      // Pattern 1: description contains ": " — these are the old bug duplicates
      // e.g., description = "Manuels: fghsgxdv"
      for (const need of needs) {
        if (need.description && need.description.includes(': ')) {
          toDelete.push(need.id);
        }
      }

      // Pattern 2: bare duplicate — same type + same description as another entry
      // but this one has no notes and was created after the one with notes
      const seen = new Map<string, typeof needs[0]>();
      for (const need of needs) {
        const key = `${need.type}::${need.description || ''}`;
        if (seen.has(key)) {
          // Keep the one with notes, delete the bare duplicate
          const prev = seen.get(key)!;
          if (!need.notes && prev.notes) {
            toDelete.push(need.id);
          } else if (need.notes && !prev.notes) {
            toDelete.push(prev.id);
            seen.set(key, need);
          } else if (!need.notes && !prev.notes) {
            // Both bare — delete the newer one
            toDelete.push(need.id);
          }
        } else {
          seen.set(key, need);
        }
      }
    }

    // Deduplicate the delete list
    const uniqueDeletes = Array.from(new Set(toDelete));

    if (uniqueDeletes.length > 0) {
      await prisma.visitNeed.deleteMany({
        where: { id: { in: uniqueDeletes } },
      });
    }

    return NextResponse.json({
      deleted: uniqueDeletes.length,
      ids: uniqueDeletes,
    });
  } catch (error) {
    console.error('Cleanup needs error:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
