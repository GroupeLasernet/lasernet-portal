// ============================================================
// /api/files/documents/[id]
// ------------------------------------------------------------
// PATCH  — rename + recategorize. If `name` changes, we also
//          rename the underlying Drive file so both stay in
//          sync (if Drive rename fails we still save the DB
//          side but surface a warning).
// DELETE — remove from Drive (best-effort) AND from the DB.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { deleteFromDrive, renameOnDrive } from '@/lib/google-drive';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => ({}));
  const existing = await prisma.fileAsset.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: any = {};
  if (typeof body.name === 'string' && body.name.trim() && body.name !== existing.name) {
    updates.name = body.name.trim();
    // Best-effort Drive rename
    try {
      await renameOnDrive(existing.driveFileId, updates.name);
    } catch (e) {
      // Log but don't block — the DB rename still helps the UI.
      console.error('Drive rename failed', e);
    }
  }
  if ('folderId' in body) {
    updates.folderId = body.folderId || null;
    // Clear legacy columns when folderId is explicitly set — the
    // FK is the source of truth going forward.
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

  // SKU link diffing — if skuIds is explicitly present in the body,
  // replace the entire link set with the one provided. We delete
  // removed ones and create added ones (uses the @@unique compound
  // to avoid dupes). skuNames (optional) is a parallel array used
  // as a denormalized display fallback.
  const skuIdsIncoming: string[] | null = Array.isArray(body.skuIds)
    ? body.skuIds.filter((s: unknown): s is string => typeof s === 'string')
    : null;
  const skuNamesIncoming: (string | null)[] = Array.isArray(body.skuNames)
    ? body.skuNames.map((n: unknown) => (typeof n === 'string' ? n : null))
    : [];

  // Run update + sku sync inside a single transaction so the UI
  // never sees a half-updated row on save.
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.fileAsset.update({
      where: { id: params.id },
      data: updates,
    });

    if (skuIdsIncoming !== null) {
      const current = await tx.fileAssetSku.findMany({
        where: { fileAssetId: params.id },
        select: { skuId: true },
      });
      const currentSet = new Set(current.map((c) => c.skuId));
      const incomingSet = new Set(skuIdsIncoming);
      const toAdd = skuIdsIncoming.filter((s) => !currentSet.has(s));
      const toRemove = [...currentSet].filter((s) => !incomingSet.has(s));

      if (toRemove.length > 0) {
        await tx.fileAssetSku.deleteMany({
          where: { fileAssetId: params.id, skuId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.fileAssetSku.createMany({
          data: toAdd.map((skuId) => {
            const idx = skuIdsIncoming.indexOf(skuId);
            return {
              fileAssetId: params.id,
              skuId,
              skuName: skuNamesIncoming[idx] ?? null,
            };
          }),
          skipDuplicates: true,
        });
      }
    }

    return tx.fileAsset.findUniqueOrThrow({
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
    sizeBytes: Number(row.sizeBytes),
    skuIds: row.skuLinks.map((l) => l.skuId),
    skus: row.skuLinks.map((l) => ({ id: l.skuId, name: l.skuName })),
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const existing = await prisma.fileAsset.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Best-effort Drive delete — if it fails (file already gone,
  // permission flap) we still drop the DB row so the UI stays
  // clean. The Drive side can be reconciled later.
  try {
    await deleteFromDrive(existing.driveFileId);
  } catch (e) {
    console.error('Drive delete failed', e);
  }

  await prisma.fileAsset.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
