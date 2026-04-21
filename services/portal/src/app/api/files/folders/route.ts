// ============================================================
// /api/files/folders
// ------------------------------------------------------------
// GET  — list every persisted folder. The admin/files page
//        builds a recursive tree on the client via FileFolder
//        .parentId self-reference. Empty folders persist across
//        reloads.
// POST — create a new folder. Body: { name, parentId? }.
//        parentId = null/omitted → top-level.
//        parentId = "<id>" → nested under that folder at any
//        depth. Returns 409 if (name, parentId) would collide
//        with an existing sibling.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const rows = await prisma.fileFolder.findMany({
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const parentId =
    typeof body.parentId === 'string' && body.parentId.trim()
      ? body.parentId.trim()
      : null;

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  // Validate parent (if any).
  if (parentId) {
    const parent = await prisma.fileFolder.findUnique({ where: { id: parentId } });
    if (!parent) {
      return NextResponse.json({ error: 'Parent folder not found' }, { status: 400 });
    }
  }

  // Uniqueness check within siblings.
  const dup = await prisma.fileFolder.findFirst({ where: { name, parentId } });
  if (dup) return NextResponse.json(dup); // idempotent — return the existing one

  const row = await prisma.fileFolder.create({ data: { name, parentId } });
  return NextResponse.json(row);
}
