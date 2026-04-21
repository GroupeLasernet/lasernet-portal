// ============================================================
// /api/files/folders/[id]
// ------------------------------------------------------------
// PATCH  — rename a folder, or move it under a new parent.
//          Body: { name?, parentId? }. `parentId: null` moves to
//          root. Cycle prevention: you can't move a folder into
//          itself or any of its own descendants.
// DELETE — delete a folder and its entire subtree. Files/videos
//          directly inside any deleted folder fall back to
//          Uncategorized (folderId → NULL). Files themselves are
//          preserved — this endpoint never deletes assets.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';

/** Collect every descendant id (including the root) via BFS. */
async function collectSubtree(rootId: string): Promise<string[]> {
  const ids: string[] = [rootId];
  const queue: string[] = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    const kids = await prisma.fileFolder.findMany({
      where: { parentId: current },
      select: { id: true },
    });
    for (const k of kids) {
      ids.push(k.id);
      queue.push(k.id);
    }
  }
  return ids;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => ({}));
  const folder = await prisma.fileFolder.findUnique({ where: { id: params.id } });
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: { name?: string; parentId?: string | null } = {};

  if (typeof body.name === 'string') {
    const nextName = body.name.trim();
    if (!nextName) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (nextName !== folder.name) updates.name = nextName;
  }

  if ('parentId' in body) {
    const nextParent: string | null =
      typeof body.parentId === 'string' && body.parentId.trim() ? body.parentId.trim() : null;

    if (nextParent !== folder.parentId) {
      if (nextParent === folder.id) {
        return NextResponse.json({ error: 'Cannot move a folder into itself' }, { status: 400 });
      }
      if (nextParent) {
        // Validate new parent exists, then guard against cycles.
        const parentRow = await prisma.fileFolder.findUnique({ where: { id: nextParent } });
        if (!parentRow) return NextResponse.json({ error: 'Parent folder not found' }, { status: 400 });
        const descendants = await collectSubtree(folder.id);
        if (descendants.includes(nextParent)) {
          return NextResponse.json({ error: 'Cannot move a folder into one of its descendants' }, { status: 400 });
        }
      }
      updates.parentId = nextParent;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(folder);
  }

  // Sibling uniqueness check — only when name or parent is actually changing.
  const finalName = updates.name ?? folder.name;
  const finalParent = 'parentId' in updates ? updates.parentId! : folder.parentId;
  const dup = await prisma.fileFolder.findFirst({
    where: { name: finalName, parentId: finalParent, NOT: { id: folder.id } },
  });
  if (dup) {
    return NextResponse.json({ error: 'A folder with that name already exists here' }, { status: 409 });
  }

  const updated = await prisma.fileFolder.update({
    where: { id: folder.id },
    data: updates,
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const folder = await prisma.fileFolder.findUnique({ where: { id: params.id } });
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Gather the entire subtree so we can null out folderId on
  // every contained asset in a single step. Prisma's ON DELETE
  // CASCADE deletes the folder rows; SET NULL on FileAsset /
  // VideoAsset handles asset orphaning automatically, but we
  // keep an explicit updateMany here to stay tolerant of FK
  // skew during the migration window.
  const subtreeIds = await collectSubtree(folder.id);

  await prisma.$transaction([
    prisma.fileAsset.updateMany({
      where: { folderId: { in: subtreeIds } },
      data: { folderId: null },
    }),
    prisma.videoAsset.updateMany({
      where: { folderId: { in: subtreeIds } },
      data: { folderId: null },
    }),
    // Deleting the root triggers ON DELETE CASCADE for descendants.
    prisma.fileFolder.delete({ where: { id: folder.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
