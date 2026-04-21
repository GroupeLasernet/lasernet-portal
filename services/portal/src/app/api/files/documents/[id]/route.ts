// ============================================================
// /api/files/documents/[id]
// ------------------------------------------------------------
// PATCH  — rename + recategorize + re-link SKUs.
// DELETE — drop from Drive (best-effort) and from the DB.
// Thin route: parse params → guard → delegate to documentsService
// → respond. All orchestration lives in lib/files/documentsService.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { ApiError } from '@/lib/files/shared';
import { updateDocument, deleteDocument } from '@/lib/files/documentsService';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const body = await request.json().catch(() => ({}));
    const data = await updateDocument(params.id, body);
    return NextResponse.json(data);
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
    await deleteDocument(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
