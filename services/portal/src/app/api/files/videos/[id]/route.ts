// ============================================================
// /api/files/videos/[id]
// ------------------------------------------------------------
// PATCH  — edit title / URL / description / category / scope.
// DELETE — remove the Vimeo link metadata. Does NOT touch the
//          actual Vimeo video (Vimeo is managed out-of-band).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:.*\/)?(\d+)/i) || url.match(/player\.vimeo\.com\/video\/(\d+)/i);
  return m ? m[1] : null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => ({}));
  const existing = await prisma.videoAsset.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: any = {};
  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
  if (typeof body.vimeoUrl === 'string' && body.vimeoUrl.trim()) {
    updates.vimeoUrl = body.vimeoUrl.trim();
    updates.vimeoId = extractVimeoId(body.vimeoUrl.trim());
  }
  if ('description' in body) updates.description = body.description || null;
  if ('folderId' in body) {
    updates.folderId = body.folderId || null;
    updates.category = null;
    updates.subCategory = null;
  }
  // LEGACY: still honored when folderId isn't in the payload.
  if (!('folderId' in body)) {
    if ('category' in body) updates.category = body.category || null;
    if ('subCategory' in body) updates.subCategory = body.subCategory || null;
  }
  if ('scope' in body) updates.scope = body.scope || 'internal';
  if ('managedClientId' in body) updates.managedClientId = body.managedClientId || null;
  if ('localBusinessId' in body) updates.localBusinessId = body.localBusinessId || null;

  const row = await prisma.videoAsset.update({
    where: { id: params.id },
    data: updates,
    include: {
      managedClient: { select: { id: true, displayName: true } },
      localBusiness: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const existing = await prisma.videoAsset.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.videoAsset.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
