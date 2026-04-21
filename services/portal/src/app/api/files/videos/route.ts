// ============================================================
// /api/files/videos
// ------------------------------------------------------------
// GET  — list videos (optional scope / client / folder filters).
// POST — add a Vimeo link (JSON body).
// Thin route: parse params → guard → delegate to videosService
// → respond. All orchestration lives in lib/files/videosService.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { ApiError, parseAssetFilters } from '@/lib/files/shared';
import {
  listVideos,
  createVideo,
  parseCreateVideoBody,
} from '@/lib/files/videosService';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const filters = parseAssetFilters(new URL(request.url).searchParams);
  const data = await listVideos(filters);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const body = await request.json().catch(() => ({}));
    const uploadedById =
      ('userId' in guard.user && guard.user.userId) || guard.user.id || null;
    const input = parseCreateVideoBody(body, uploadedById);
    const data = await createVideo(input);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
