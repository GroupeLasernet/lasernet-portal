// ============================================================
// /api/files/folders
// ------------------------------------------------------------
// GET  — list every persisted folder. The admin/files page
//        merges this with file-derived categories to build the
//        sidebar tree. Folders persist across reloads even
//        when empty.
// POST — create a new folder. Body: { name, parent? }.
//        parent = null/omitted → top-level category.
//        parent = "<categoryName>" → subfolder of that category.
//        Returns 409 if (name, parent) already exists.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const rows = await prisma.fileFolder.findMany({
    orderBy: [{ parent: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const parent = typeof body.parent === 'string' && body.parent.trim()
    ? body.parent.trim()
    : null;

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  // If subfolder, parent category must exist as a folder OR be
  // present in a FileAsset/VideoAsset row (it was created by
  // being typed into the category field directly).
  if (parent) {
    const [folderExists, assetExists, videoExists] = await Promise.all([
      prisma.fileFolder.findFirst({ where: { name: parent, parent: null } }),
      prisma.fileAsset.findFirst({ where: { category: parent } }),
      prisma.videoAsset.findFirst({ where: { category: parent } }),
    ]);
    if (!folderExists && !assetExists && !videoExists) {
      return NextResponse.json({ error: 'Parent category not found' }, { status: 400 });
    }
  }

  // Uniqueness check: (name, parent) — duplicates silently
  // collapse to the existing row rather than erroring out.
  const dup = await prisma.fileFolder.findFirst({ where: { name, parent } });
  if (dup) return NextResponse.json(dup);

  const row = await prisma.fileFolder.create({ data: { name, parent } });
  return NextResponse.json(row);
}
