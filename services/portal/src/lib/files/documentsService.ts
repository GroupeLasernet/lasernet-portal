// ============================================================
// lib/files/documentsService.ts
// ------------------------------------------------------------
// Owns all DB/Drive orchestration for document assets:
//   • listDocuments(filters)          — GET /api/files/documents
//   • createDocument(form, uploadedBy) — POST /api/files/documents (multipart)
//   • updateDocument(id, body)        — PATCH /api/files/documents/[id]
//   • deleteDocument(id)              — DELETE /api/files/documents/[id]
// Routes should stay thin — parse → guard → call → respond.
// Services throw ApiError(status, msg) to short-circuit with a
// specific HTTP response; anything else bubbles up as a 500.
// ============================================================

import prisma from '@/lib/prisma';
import { uploadToDrive, renameOnDrive, deleteFromDrive } from '@/lib/google-drive';
import {
  ApiError,
  AssetFilters,
  assetFiltersToWhere,
  includeForFileAsset,
  reshapeFileAsset,
  parseSkuPayloadFromJson,
  parseSkuPayloadFromForm,
} from './shared';

/** Read a filtered page of documents, already reshaped for JSON transport. */
export async function listDocuments(filters: AssetFilters) {
  const rows = await prisma.fileAsset.findMany({
    where: assetFiltersToWhere(filters),
    include: includeForFileAsset,
    orderBy: { uploadedAt: 'desc' },
  });
  return rows.map(reshapeFileAsset);
}

/** Shape POSTed to createDocument once the route has parsed the form. */
export interface CreateDocumentInput {
  file: Blob;
  scope: string;
  folderId: string | null;
  legacyCategory: string | null;
  legacySubCategory: string | null;
  managedClientId: string | null;
  localBusinessId: string | null;
  skuIds: string[];
  skuNames: (string | null)[];
  uploadedById: string | null;
}

/**
 * Read a multipart FormData into the service's CreateDocumentInput shape.
 * Keeps the legacy category / subCategory columns in the contract because
 * old clients (+ the previous Vercel build) still send them.
 */
export function parseCreateDocumentForm(
  form: FormData,
  uploadedById: string | null,
): CreateDocumentInput {
  const file = form.get('file');
  if (!file || !(file instanceof Blob)) {
    throw new ApiError(400, 'No file provided');
  }

  const scope = (form.get('scope') as string | null) || 'internal';
  const folderId = (form.get('folderId') as string | null) || null;
  const legacyCategory = (form.get('category') as string | null) || null;
  const legacySubCategory = (form.get('subCategory') as string | null) || null;
  const managedClientId = (form.get('managedClientId') as string | null) || null;
  const localBusinessId = (form.get('localBusinessId') as string | null) || null;

  const { skuIds, skuNames } = parseSkuPayloadFromForm(form);

  return {
    file,
    scope,
    folderId,
    legacyCategory,
    legacySubCategory,
    managedClientId,
    localBusinessId,
    skuIds,
    skuNames,
    uploadedById,
  };
}

/**
 * Upload to Drive, then persist the metadata row. Throws ApiError(500)
 * when Drive fails — callers translate to a NextResponse at the edge.
 */
export async function createDocument(input: CreateDocumentInput) {
  const { file } = input;
  const filename = (file as unknown as { name?: string }).name || 'upload.bin';
  const mimeType = file.type || 'application/octet-stream';
  const buffer = Buffer.from(await file.arrayBuffer());

  let uploaded;
  try {
    uploaded = await uploadToDrive({ filename, mimeType, buffer });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(500, `Drive upload failed: ${msg}`);
  }

  const row = await prisma.fileAsset.create({
    data: {
      driveFileId: uploaded.driveFileId,
      name: uploaded.name,
      mimeType: uploaded.mimeType,
      sizeBytes: BigInt(uploaded.sizeBytes),
      scope: input.scope,
      folderId: input.folderId,
      // Mirror the FK name into the legacy string columns so the
      // Vercel Preview running the old build keeps rendering sane
      // chips while prod rolls forward.
      category: input.folderId ? null : input.legacyCategory,
      subCategory: input.folderId ? null : input.legacySubCategory,
      managedClientId: input.managedClientId,
      localBusinessId: input.localBusinessId,
      uploadedById: input.uploadedById,
      skuLinks:
        input.skuIds.length > 0
          ? {
              create: input.skuIds.map((skuId, i) => ({
                skuId,
                skuName: input.skuNames[i] ?? null,
              })),
            }
          : undefined,
    },
    include: includeForFileAsset,
  });

  return reshapeFileAsset(row);
}

/**
 * PATCH body for updateDocument. Route passes the parsed JSON body
 * untouched; the service picks only the fields it knows about.
 */
export interface UpdateDocumentInput {
  name?: unknown;
  folderId?: unknown;
  category?: unknown;
  subCategory?: unknown;
  scope?: unknown;
  managedClientId?: unknown;
  localBusinessId?: unknown;
  skuIds?: unknown;
  skuNames?: unknown;
}

/**
 * Apply rename (best-effort Drive sync) + recategorize + SKU link
 * diffing inside a single transaction so the UI never sees a
 * half-updated row on save.
 */
export async function updateDocument(id: string, body: UpdateDocumentInput) {
  const existing = await prisma.fileAsset.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Not found');

  const updates: Record<string, unknown> = {};

  if (typeof body.name === 'string' && body.name.trim() && body.name !== existing.name) {
    updates.name = body.name.trim();
    try {
      await renameOnDrive(existing.driveFileId, updates.name as string);
    } catch (e) {
      // Log but don't block — the DB rename still helps the UI.
      console.error('Drive rename failed', e);
    }
  }
  if ('folderId' in body) {
    updates.folderId = (body.folderId as string | null) || null;
    // Clear legacy columns when folderId is explicitly set — the
    // FK is the source of truth going forward.
    updates.category = null;
    updates.subCategory = null;
  }
  // LEGACY: still honored when folderId isn't in the payload.
  if (!('folderId' in body)) {
    if ('category' in body) updates.category = (body.category as string | null) || null;
    if ('subCategory' in body) updates.subCategory = (body.subCategory as string | null) || null;
  }
  if ('scope' in body) updates.scope = (body.scope as string | null) || 'internal';
  if ('managedClientId' in body) updates.managedClientId = (body.managedClientId as string | null) || null;
  if ('localBusinessId' in body) updates.localBusinessId = (body.localBusinessId as string | null) || null;

  const { skuIds: skuIdsIncoming, skuNames: skuNamesIncoming } = parseSkuPayloadFromJson(
    body as Record<string, unknown>,
  );

  const row = await prisma.$transaction(async (tx) => {
    await tx.fileAsset.update({ where: { id }, data: updates });

    if (skuIdsIncoming !== null) {
      const current = await tx.fileAssetSku.findMany({
        where: { fileAssetId: id },
        select: { skuId: true },
      });
      const currentSet = new Set(current.map((c) => c.skuId));
      const incomingSet = new Set(skuIdsIncoming);
      const toAdd = skuIdsIncoming.filter((s) => !currentSet.has(s));
      const toRemove = Array.from(currentSet).filter((s) => !incomingSet.has(s));

      if (toRemove.length > 0) {
        await tx.fileAssetSku.deleteMany({
          where: { fileAssetId: id, skuId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.fileAssetSku.createMany({
          data: toAdd.map((skuId) => {
            const idx = skuIdsIncoming.indexOf(skuId);
            return {
              fileAssetId: id,
              skuId,
              skuName: skuNamesIncoming[idx] ?? null,
            };
          }),
          skipDuplicates: true,
        });
      }
    }

    return tx.fileAsset.findUniqueOrThrow({ where: { id }, include: includeForFileAsset });
  });

  return reshapeFileAsset(row);
}

/** Best-effort Drive delete, then DB delete. Returns ApiError(404) if unknown. */
export async function deleteDocument(id: string) {
  const existing = await prisma.fileAsset.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Not found');

  // Best-effort Drive delete — if it fails (file already gone,
  // permission flap) we still drop the DB row so the UI stays
  // clean. The Drive side can be reconciled later.
  try {
    await deleteFromDrive(existing.driveFileId);
  } catch (e) {
    console.error('Drive delete failed', e);
  }

  await prisma.fileAsset.delete({ where: { id } });
}
