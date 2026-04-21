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

  const skuIdsIncoming: string[] | null = Array.isArray(body.skuIds)
    ? body.skuIds.filter((s: unknown): s is string => typeof s === 'string')
    : null;
  const skuNamesIncoming: (string | null)[] = Array.isArray(body.skuNames)
    ? body.skuNames.map((n: unknown) => (typeof n === 'string' ? n : null))
    : [];

  const row = await prisma.$transaction(async (tx) => {
    await tx.videoAsset.update({
      where: { id: params.id },
      data: updates,
    });

    if (skuIdsIncoming !== null) {
      const current = await tx.videoAssetSku.findMany({
        where: { videoAssetId: params.id },
        select: { skuId: true },
      });
      const currentSet = new Set(current.map((c) => c.skuId));
      const incomingSet = new Set(skuIdsIncoming);
      const toAdd = skuIdsIncoming.filter((s) => !currentSet.has(s));
      const toRemove = [...currentSet].filter((s) => !incomingSet.has(s));

      if (toRemove.length > 0) {
        await tx.videoAssetSku.deleteMany({
          where: { videoAssetId: params.id, skuId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.videoAssetSku.createMany({
          data: toAdd.map((skuId) => {
            const idx = skuIdsIncoming.indexOf(skuId);
            return {
              videoAssetId: params.id,
              skuId,
              skuName: skuNamesIncoming[idx] ?? null,
            };
          }),
          skipDuplicates: true,
        });
      }
    }

    return tx.videoAsset.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        managedClient: { select: { id: true, displayName: true } },
        localBusiness: { select: { id: true, name: true } },
        skuLinks: { select: { skuId: true, skuName: true } },
      },
    });
  });

  return NextResponse.json({
    ...row,
    skuIds: row.skuLinks.map((l) => l.skuId),
    skus: row.skuLinks.map((l) => ({ id: l.skuId, name: l.skuName })),
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const existing = await prisma.videoAsset.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.videoAsset.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
