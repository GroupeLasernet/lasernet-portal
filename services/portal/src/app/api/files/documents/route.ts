// ============================================================
// /api/files/documents
// ------------------------------------------------------------
// GET  — list every document (with optional scope / client /
//         category filters). Returns rows with business labels
//         already joined for display.
// POST — upload a new document. Accepts multipart/form-data:
//         file (binary), scope, category, subCategory,
//         managedClientId, localBusinessId. Streams bytes to
//         Google Drive, then stores metadata in the DB.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { uploadToDrive } from '@/lib/google-drive';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const managedClientId = searchParams.get('managedClientId');
  const localBusinessId = searchParams.get('localBusinessId');
  const category = searchParams.get('category');
  const folderId = searchParams.get('folderId');

  const where: any = {};
  if (scope) where.scope = scope;
  if (managedClientId) where.managedClientId = managedClientId;
  if (localBusinessId) where.localBusinessId = localBusinessId;
  if (category) where.category = category;
  if (folderId) where.folderId = folderId;

  const rows = await prisma.fileAsset.findMany({
    where,
    include: {
      managedClient: { select: { id: true, displayName: true } },
      localBusiness: { select: { id: true, name: true } },
      skuLinks: { select: { skuId: true, skuName: true } },
    },
    orderBy: { uploadedAt: 'desc' },
  });

  // BigInt → Number for JSON transport. Also flatten skuLinks to
  // skuIds / skus so the client doesn't have to reshape.
  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      sizeBytes: Number(r.sizeBytes),
      skuIds: r.skuLinks.map((l) => l.skuId),
      skus: r.skuLinks.map((l) => ({ id: l.skuId, name: l.skuName })),
    })),
  );
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  // Multipart form: file + fields
  const form = await request.formData();
  const file = form.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  const filename = (file as any).name || 'upload.bin';
  const mimeType = file.type || 'application/octet-stream';
  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  const scope = (form.get('scope') as string | null) || 'internal';
  const folderId = (form.get('folderId') as string | null) || null;
  // LEGACY inputs — still accepted during the migration window so
  // old clients don't 400. When folderId is set, category/subCategory
  // are ignored on write.
  const legacyCategory = (form.get('category') as string | null) || null;
  const legacySubCategory = (form.get('subCategory') as string | null) || null;
  const managedClientId = (form.get('managedClientId') as string | null) || null;
  const localBusinessId = (form.get('localBusinessId') as string | null) || null;

  // skuIds: JSON-encoded string[] (QuickBooks item Ids). Optional.
  const skuIdsRaw = (form.get('skuIds') as string | null) || null;
  let skuIds: string[] = [];
  if (skuIdsRaw) {
    try {
      const parsed = JSON.parse(skuIdsRaw);
      if (Array.isArray(parsed)) skuIds = parsed.filter((s): s is string => typeof s === 'string');
    } catch {
      // tolerate bad json — just no skus
    }
  }
  // Optional snapshot names, same shape. Lookup by position via skuIds order.
  const skuNamesRaw = (form.get('skuNames') as string | null) || null;
  let skuNames: (string | null)[] = [];
  if (skuNamesRaw) {
    try {
      const parsed = JSON.parse(skuNamesRaw);
      if (Array.isArray(parsed))
        skuNames = parsed.map((n) => (typeof n === 'string' ? n : null));
    } catch {
      // ignore
    }
  }

  let uploaded;
  try {
    uploaded = await uploadToDrive({ filename, mimeType, buffer });
  } catch (e: any) {
    return NextResponse.json({ error: `Drive upload failed: ${e.message}` }, { status: 500 });
  }

  const uploadedById = ('userId' in guard.user && guard.user.userId) || guard.user.id || null;

  const row = await prisma.fileAsset.create({
    data: {
      driveFileId: uploaded.driveFileId,
      name: uploaded.name,
      mimeType: uploaded.mimeType,
      sizeBytes: BigInt(uploaded.sizeBytes),
      scope,
      folderId,
      // Mirror the FK name into the legacy string columns so the
      // Vercel Preview running the old build keeps rendering sane
      // chips while prod rolls forward.
      category: folderId ? null : legacyCategory,
      subCategory: folderId ? null : legacySubCategory,
      managedClientId,
      localBusinessId,
      uploadedById,
      skuLinks:
        skuIds.length > 0
          ? {
              create: skuIds.map((skuId, i) => ({
                skuId,
                skuName: skuNames[i] ?? null,
              })),
            }
          : undefined,
    },
    include: {
      managedClient: { select: { id: true, displayName: true } },
      localBusiness: { select: { id: true, name: true } },
      skuLinks: { select: { skuId: true, skuName: true } },
    },
  });

  return NextResponse.json({
    ...row,
    sizeBytes: Number(row.sizeBytes),
    skuIds: row.skuLinks.map((l) => l.skuId),
    skus: row.skuLinks.map((l) => ({ id: l.skuId, name: l.skuName })),
  });
}
