// ============================================================
// /api/files/videos/[id]
// ------------------------------------------------------------
// PATCH  — edit title / URL / description / folder / scope / SKUs.
// DELETE — remove the Vimeo link metadata. Does NOT touch the
//          actual Vimeo video (Vimeo is managed out-of-band).
// Thin route: parse params → guard → delegate to videosService
// → respond. All orchestration lives in lib/files/videosService.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { ApiError } from '@/lib/files/shared';
import { updateVideo, deleteVideo } from '@/lib/files/videosService';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const body = await request.json().catch(() => ({}));
    const data = await updateVideo(params.id, body);
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
    await deleteVideo(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
