// ============================================================
// /api/files/folders
// ------------------------------------------------------------
// GET  — list every persisted folder. Client builds the tree.
// POST — create a folder (idempotent on (name, parentId)).
// Thin route: parse → guard → delegate to foldersService → respond.
// All orchestration lives in lib/files/foldersService.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { ApiError } from '@/lib/files/shared';
import {
  listFolders,
  createFolder,
  parseCreateFolderBody,
} from '@/lib/files/foldersService';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const rows = await listFolders();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const body = await request.json().catch(() => ({}));
    const input = parseCreateFolderBody(body);
    const row = await createFolder(input);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
