// ============================================================
// lib/files/videosService.ts
// ------------------------------------------------------------
// Owns DB orchestration for Vimeo-backed video assets:
//   • listVideos(filters)        — GET /api/files/videos
//   • createVideo(body, userId)  — POST /api/files/videos
//   • updateVideo(id, body)      — PATCH /api/files/videos/[id]
//   • deleteVideo(id)            — DELETE /api/files/videos/[id]
// Also exports extractVimeoId() — the URL parser used to be
// duplicated in the two video route files; now it lives once.
// ============================================================

import prisma from '@/lib/prisma';
import {
  ApiError,
  AssetFilters,
  assetFiltersToWhere,
  includeForVideoAsset,
  reshapeVideoAsset,
  parseSkuPayloadFromJson,
} from './shared';

/**
 * Extract the numeric Vimeo ID from any of the common URL shapes
 * we see, or return null if we can't parse one out. Handles:
 *   https://vimeo.com/123456789
 *   https://vimeo.com/123456789/abcdef0123  (private link hash)
 *   https://player.vimeo.com/video/123456789
 *   https://vimeo.com/channels/xyz/123456789
 */
export function extractVimeoId(url: string): string | null {
  const m =
    url.match(/vimeo\.com\/(?:.*\/)?(\d+)/i) ||
    url.match(/player\.vimeo\.com\/video\/(\d+)/i);
  return m ? m[1] : null;
}

/** Read a filtered page of videos, already reshaped for JSON transport. */
export async function listVideos(filters: AssetFilters) {
  const rows = await prisma.videoAsset.findMany({
    where: assetFiltersToWhere(filters),
    include: includeForVideoAsset,
    orderBy: { uploadedAt: 'desc' },
  });
  return rows.map(reshapeVideoAsset);
}

/** Body shape for createVideo, post-parse. */
export interface CreateVideoInput {
  title: string;
  vimeoUrl: string;
  description: string | null;
  folderId: string | null;
  legacyCategory: string | null;
  legacySubCategory: string | null;
  scope: string;
  managedClientId: string | null;
  localBusinessId: string | null;
  skuIds: string[];
  skuNames: (string | null)[];
  uploadedById: string | null;
}

/**
 * Validate + normalize a JSON POST body into CreateVideoInput.
 * Throws ApiError(400) when required fields are missing.
 */
export function parseCreateVideoBody(
  body: Record<string, unknown>,
  uploadedById: string | null,
): CreateVideoInput {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const vimeoUrl = typeof body.vimeoUrl === 'string' ? body.vimeoUrl.trim() : '';
  if (!title || !vimeoUrl) {
    throw new ApiError(400, 'title and vimeoUrl are required');
  }

  const folderId =
    typeof body.folderId === 'string' && body.folderId ? body.folderId : null;

  const skuIds: string[] = Array.isArray(body.skuIds)
    ? (body.skuIds as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const skuNames: (string | null)[] = Array.isArray(body.skuNames)
    ? (body.skuNames as unknown[]).map((n) => (typeof n === 'string' ? n : null))
    : [];

  return {
    title,
    vimeoUrl,
    description: (body.description as string | null) ?? null,
    folderId,
    legacyCategory: (body.category as string | null) ?? null,
    legacySubCategory: (body.subCategory as string | null) ?? null,
    scope: (body.scope as string | undefined) || 'internal',
    managedClientId: (body.managedClientId as string | null) ?? null,
    localBusinessId: (body.localBusinessId as string | null) ?? null,
    skuIds,
    skuNames,
    uploadedById,
  };
}

/** Persist a new video link (no Vimeo API call — Vimeo is managed out-of-band). */
export async function createVideo(input: CreateVideoInput) {
  const vimeoId = extractVimeoId(input.vimeoUrl);

  const row = await prisma.videoAsset.create({
    data: {
      title: input.title,
      vimeoUrl: input.vimeoUrl,
      vimeoId,
      description: input.description,
      folderId: input.folderId,
      // LEGACY — see documents POST route.
      category: input.folderId ? null : input.legacyCategory,
      subCategory: input.folderId ? null : input.legacySubCategory,
      scope: input.scope,
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
    include: includeForVideoAsset,
  });

  return reshapeVideoAsset(row);
}

/** PATCH body for updateVideo — route passes parsed JSON through unchanged. */
export interface UpdateVideoInput {
  title?: unknown;
  vimeoUrl?: unknown;
  description?: unknown;
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
 * Apply edits to a VideoAsset + diff SKU links inside a single
 * transaction (same pattern as documents).
 */
export async function updateVideo(id: string, body: UpdateVideoInput) {
  const existing = await prisma.videoAsset.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Not found');

  const updates: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if (typeof body.vimeoUrl === 'string' && body.vimeoUrl.trim()) {
    updates.vimeoUrl = body.vimeoUrl.trim();
    updates.vimeoId = extractVimeoId(body.vimeoUrl.trim());
  }
  if ('description' in body) updates.description = (body.description as string | null) || null;
  if ('folderId' in body) {
    updates.folderId = (body.folderId as string | null) || null;
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
    await tx.videoAsset.update({ where: { id }, data: updates });

    if (skuIdsIncoming !== null) {
      const current = await tx.videoAssetSku.findMany({
        where: { videoAssetId: id },
        select: { skuId: true },
      });
      const currentSet = new Set(current.map((c) => c.skuId));
      const incomingSet = new Set(skuIdsIncoming);
      const toAdd = skuIdsIncoming.filter((s) => !currentSet.has(s));
      const toRemove = Array.from(currentSet).filter((s) => !incomingSet.has(s));

      if (toRemove.length > 0) {
        await tx.videoAssetSku.deleteMany({
          where: { videoAssetId: id, skuId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.videoAssetSku.createMany({
          data: toAdd.map((skuId) => {
            const idx = skuIdsIncoming.indexOf(skuId);
            return {
              videoAssetId: id,
              skuId,
              skuName: skuNamesIncoming[idx] ?? null,
            };
          }),
          skipDuplicates: true,
        });
      }
    }

    return tx.videoAsset.findUniqueOrThrow({ where: { id }, include: includeForVideoAsset });
  });

  return reshapeVideoAsset(row);
}

/** Delete the VideoAsset row. The actual Vimeo video is managed out-of-band. */
export async function deleteVideo(id: string) {
  const existing = await prisma.videoAsset.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Not found');
  await prisma.videoAsset.delete({ where: { id } });
}
