// ============================================================
// /api/files/videos
// ------------------------------------------------------------
// GET  — list every video (with optional scope / client /
//         category filters). Pure metadata; no storage backend
//         on our side — videos live on Vimeo.
// POST — add a Vimeo link. Accepts JSON:
//         { title, vimeoUrl, description?, category?,
//           subCategory?, scope?, managedClientId?,
//           localBusinessId? }
//         We try to extract the numeric vimeo ID from common
//         URL shapes so embeds can use the canonical format.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';

// Accepts a wide set of Vimeo URL formats and returns the
// numeric video ID, or null. Handles:
//   https://vimeo.com/123456789
//   https://vimeo.com/123456789/abcdef0123  (private link hash)
//   https://player.vimeo.com/video/123456789
//   https://vimeo.com/channels/xyz/123456789
function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:.*\/)?(\d+)/i) || url.match(/player\.vimeo\.com\/video\/(\d+)/i);
  return m ? m[1] : null;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const managedClientId = searchParams.get('managedClientId');
  const localBusinessId = searchParams.get('localBusinessId');
  const category = searchParams.get('category');
  const folderId = searchParams.get('folderId');

  const where: any = {};
  if (scope) where.scope = scope;
  if (managedClientId) where.managedClientId = managedClientId;
  if (localBusinessId) where.localBusinessId = localBusinessId;
  if (category) where.category = category;
  if (folderId) where.folderId = folderId;

  const rows = await prisma.videoAsset.findMany({
    where,
    include: {
      managedClient: { select: { id: true, displayName: true } },
      localBusiness: { select: { id: true, name: true } },
      skuLinks: { select: { skuId: true, skuName: true } },
    },
    orderBy: { uploadedAt: 'desc' },
  });

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      skuIds: r.skuLinks.map((l) => l.skuId),
      skus: r.skuLinks.map((l) => ({ id: l.skuId, name: l.skuName })),
    })),
  );
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const vimeoUrl = typeof body.vimeoUrl === 'string' ? body.vimeoUrl.trim() : '';
  if (!title || !vimeoUrl) {
    return NextResponse.json({ error: 'title and vimeoUrl are required' }, { status: 400 });
  }

  const vimeoId = extractVimeoId(vimeoUrl);
  const uploadedById = ('userId' in guard.user && guard.user.userId) || guard.user.id || null;

  const folderId = typeof body.folderId === 'string' && body.folderId ? body.folderId : null;

  const skuIds: string[] = Array.isArray(body.skuIds)
    ? body.skuIds.filter((s: unknown): s is string => typeof s === 'string')
    : [];
  const skuNames: (string | null)[] = Array.isArray(body.skuNames)
    ? body.skuNames.map((n: unknown) => (typeof n === 'string' ? n : null))
    : [];

  const row = await prisma.videoAsset.create({
    data: {
      title,
      vimeoUrl,
      vimeoId,
      description: body.description ?? null,
      folderId,
      // LEGACY — see documents POST route.
      category: folderId ? null : (body.category ?? null),
      subCategory: folderId ? null : (body.subCategory ?? null),
      scope: body.scope || 'internal',
      managedClientId: body.managedClientId ?? null,
      localBusinessId: body.localBusinessId ?? null,
      uploadedById,
      skuLinks:
        skuIds.length > 0
          ? {
              create: skuIds.map((skuId, i) => ({
                skuId,
                skuName: skuNames[i] ?? null,
              })),
            }
          : undefined,
    },
    include: {
      managedClient: { select: { id: true, displayName: true } },
      localBusiness: { select: { id: true, name: true } },
      skuLinks: { select: { skuId: true, skuName: true } },
    },
  });

  return NextResponse.json({
    ...row,
    skuIds: row.skuLinks.map((l) => l.skuId),
    skus: row.skuLinks.map((l) => ({ id: l.skuId, name: l.skuName })),
  });
}
