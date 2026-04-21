// ============================================================
// lib/files/foldersService.ts
// ------------------------------------------------------------
// Owns DB orchestration for the FileFolder tree:
//   • listFolders()              — GET /api/files/folders
//   • createFolder(input)        — POST /api/files/folders
//     Returns existing folder on (name, parentId) collision
//     (the endpoint is idempotent by design).
//   • updateFolder(id, body)     — PATCH /api/files/folders/[id]
//     Cycle-safe: rejects moves into self or any descendant.
//   • deleteFolder(id)           — DELETE /api/files/folders/[id]
//     Walks the subtree, orphans contained files/videos back
//     to Uncategorized, then deletes the root (CASCADE takes
//     care of descendants).
// ============================================================

import prisma from '@/lib/prisma';
import { ApiError } from './shared';

/**
 * Collect every descendant id (including the given root) via BFS.
 * Used by both the cycle check on rename/move and by delete.
 */
export async function collectSubtree(rootId: string): Promise<string[]> {
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

/** Read every folder row, pre-sorted by (parentId, name) so the client tree builder is happy. */
export async function listFolders() {
  return prisma.fileFolder.findMany({
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export interface CreateFolderInput {
  name: string;
  parentId: string | null;
}

/** Parse + validate a POST body into CreateFolderInput. */
export function parseCreateFolderBody(body: Record<string, unknown>): CreateFolderInput {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const parentId =
    typeof body.parentId === 'string' && body.parentId.trim()
      ? (body.parentId as string).trim()
      : null;
  if (!name) throw new ApiError(400, 'Name is required');
  return { name, parentId };
}

/**
 * Create a folder if one with the same (name, parentId) doesn't
 * already exist; otherwise return the existing row (idempotent).
 */
export async function createFolder(input: CreateFolderInput) {
  if (input.parentId) {
    const parent = await prisma.fileFolder.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new ApiError(400, 'Parent folder not found');
  }

  const dup = await prisma.fileFolder.findFirst({
    where: { name: input.name, parentId: input.parentId },
  });
  if (dup) return dup; // idempotent — return the existing one

  return prisma.fileFolder.create({
    data: { name: input.name, parentId: input.parentId },
  });
}

/** PATCH body shape — route passes parsed JSON through unchanged. */
export interface UpdateFolderInput {
  name?: unknown;
  parentId?: unknown;
}

/**
 * Rename and/or reparent a folder. Rejects:
 *   • empty name         → 400
 *   • move into self     → 400
 *   • move into a descendant → 400
 *   • collision with a sibling of the same name → 409
 */
export async function updateFolder(id: string, body: UpdateFolderInput) {
  const folder = await prisma.fileFolder.findUnique({ where: { id } });
  if (!folder) throw new ApiError(404, 'Not found');

  const updates: { name?: string; parentId?: string | null } = {};

  if (typeof body.name === 'string') {
    const nextName = (body.name as string).trim();
    if (!nextName) throw new ApiError(400, 'Name is required');
    if (nextName !== folder.name) updates.name = nextName;
  }

  if ('parentId' in body) {
    const nextParent: string | null =
      typeof body.parentId === 'string' && (body.parentId as string).trim()
        ? (body.parentId as string).trim()
        : null;

    if (nextParent !== folder.parentId) {
      if (nextParent === folder.id) {
        throw new ApiError(400, 'Cannot move a folder into itself');
      }
      if (nextParent) {
        // Validate new parent exists, then guard against cycles.
        const parentRow = await prisma.fileFolder.findUnique({ where: { id: nextParent } });
        if (!parentRow) throw new ApiError(400, 'Parent folder not found');
        const descendants = await collectSubtree(folder.id);
        if (descendants.includes(nextParent)) {
          throw new ApiError(400, 'Cannot move a folder into one of its descendants');
        }
      }
      updates.parentId = nextParent;
    }
  }

  if (Object.keys(updates).length === 0) {
    return folder;
  }

  // Sibling uniqueness check — only when name or parent is actually changing.
  const finalName = updates.name ?? folder.name;
  const finalParent = 'parentId' in updates ? updates.parentId! : folder.parentId;
  const dup = await prisma.fileFolder.findFirst({
    where: { name: finalName, parentId: finalParent, NOT: { id: folder.id } },
  });
  if (dup) {
    throw new ApiError(409, 'A folder with that name already exists here');
  }

  return prisma.fileFolder.update({ where: { id: folder.id }, data: updates });
}

/**
 * Delete a folder and its entire subtree. Files/videos inside any
 * deleted folder fall back to Uncategorized (folderId → NULL).
 * Files themselves are preserved — this endpoint never deletes assets.
 */
export async function deleteFolder(id: string) {
  const folder = await prisma.fileFolder.findUnique({ where: { id } });
  if (!folder) throw new ApiError(404, 'Not found');

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
}
