// ============================================================
// /api/files/folders/[id]
// ------------------------------------------------------------
// PATCH  — rename a folder. Cascades the new name into:
//            • FileAsset.category / .subCategory
//            • VideoAsset.category / .subCategory
//            • child FileFolder.parent (for top-level renames)
//          All in a single transaction.
// DELETE — delete a folder. Any files/videos inside get moved
//          to Uncategorized (category/subCategory → null). Any
//          subfolders under a top-level delete are also
//          removed. Files are NEVER deleted by this endpoint.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => ({}));
  const newName = typeof body.name === 'string' ? body.name.trim() : '';
  if (!newName) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const folder = await prisma.fileFolder.findUnique({ where: { id: params.id } });
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (folder.name === newName) return NextResponse.json(folder);

  // Block rename-into-existing-sibling.
  const dup = await prisma.fileFolder.findFirst({
    where: { name: newName, parent: folder.parent, NOT: { id: folder.id } },
  });
  if (dup) return NextResponse.json({ error: 'A folder with that name already exists here' }, { status: 409 });

  const oldName = folder.name;
  const isTopLevel = folder.parent == null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.fileFolder.update({
      where: { id: folder.id },
      data: { name: newName },
    });

    if (isTopLevel) {
      // Update every asset in this category.
      await tx.fileAsset.updateMany({
        where: { category: oldName },
        data: { category: newName },
      });
      await tx.videoAsset.updateMany({
        where: { category: oldName },
        data: { category: newName },
      });
      // Update every subfolder's parent pointer.
      await tx.fileFolder.updateMany({
        where: { parent: oldName },
        data: { parent: newName },
      });
    } else {
      // Subfolder — only update rows where BOTH category and
      // subCategory match, so we don't accidentally touch a
      // sibling subfolder with the same name.
      await tx.fileAsset.updateMany({
        where: { category: folder.parent!, subCategory: oldName },
        data: { subCategory: newName },
      });
      await tx.videoAsset.updateMany({
        where: { category: folder.parent!, subCategory: oldName },
        data: { subCategory: newName },
      });
    }

    return row;
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const folder = await prisma.fileFolder.findUnique({ where: { id: params.id } });
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isTopLevel = folder.parent == null;

  await prisma.$transaction(async (tx) => {
    if (isTopLevel) {
      // Top-level: uncategorize every file/video in this category
      // (including any subfolder), then delete subfolders, then
      // delete this folder. Files are preserved — just orphaned.
      await tx.fileAsset.updateMany({
        where: { category: folder.name },
        data: { category: null, subCategory: null },
      });
      await tx.videoAsset.updateMany({
        where: { category: folder.name },
        data: { category: null, subCategory: null },
      });
      await tx.fileFolder.deleteMany({ where: { parent: folder.name } });
    } else {
      // Subfolder: only null out subCategory on rows that match
      // BOTH category + subCategory (don't touch siblings).
      await tx.fileAsset.updateMany({
        where: { category: folder.parent!, subCategory: folder.name },
        data: { subCategory: null },
      });
      await tx.videoAsset.updateMany({
        where: { category: folder.parent!, subCategory: folder.name },
        data: { subCategory: null },
      });
    }

    await tx.fileFolder.delete({ where: { id: folder.id } });
  });

  return NextResponse.json({ ok: true });
}
