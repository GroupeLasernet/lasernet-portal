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
  if ('category' in body) updates.category = body.category || null;
  if ('subCategory' in body) updates.subCategory = body.subCategory || null;
  if ('scope' in body) updates.scope = body.scope || 'internal';
  if ('managedClientId' in body) updates.managedClientId = body.managedClientId || null;
  if ('localBusinessId' in body) updates.localBusinessId = body.localBusinessId || null;

  const row = await prisma.fileAsset.update({
    where: { id: params.id },
    data: updates,
    include: {
      managedClient: { select: { id: true, displayName: true } },
      localBusiness: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ ...row, sizeBytes: Number(row.sizeBytes) });
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
