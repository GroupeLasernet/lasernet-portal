// ============================================================
// /api/files/folders/[id]
// ------------------------------------------------------------
// PATCH  — rename / move (cycle-safe).
// DELETE — delete subtree; orphan assets back to Uncategorized.
// Thin route: parse → guard → delegate to foldersService → respond.
// All orchestration lives in lib/files/foldersService.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { ApiError } from '@/lib/files/shared';
import { updateFolder, deleteFolder } from '@/lib/files/foldersService';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const body = await request.json().catch(() => ({}));
    const row = await updateFolder(params.id, body);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    await deleteFolder(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
