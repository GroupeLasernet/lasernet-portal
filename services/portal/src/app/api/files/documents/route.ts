// ============================================================
// /api/files/documents
// ------------------------------------------------------------
// GET  — list documents (optional scope / client / folder filters).
// POST — upload a new document (multipart/form-data).
// Thin route: parse params → guard → delegate to documentsService
// → respond. All orchestration lives in lib/files/documentsService.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { ApiError, parseAssetFilters } from '@/lib/files/shared';
import {
  listDocuments,
  createDocument,
  parseCreateDocumentForm,
} from '@/lib/files/documentsService';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const filters = parseAssetFilters(new URL(request.url).searchParams);
  const data = await listDocuments(filters);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const form = await request.formData();
    const uploadedById =
      ('userId' in guard.user && guard.user.userId) || guard.user.id || null;
    const input = parseCreateDocumentForm(form, uploadedById);
    const data = await createDocument(input);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
