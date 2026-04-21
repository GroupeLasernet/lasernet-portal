// ============================================================
// /api/files/by-sku?skuId=...
// ------------------------------------------------------------
// Returns every document + video linked to the given QuickBooks
// SKU. Used by the quote/invoice line-item "related files" chip
// to surface files attached to each line item's SKU without the
// user ever manually assigning files to a specific doc.
//
// Accepts either ?skuId=X (single) or ?skuIds=X,Y,Z (batch — one
// call per quote, keyed by each line item). Batch mode returns
// a map { [skuId]: { documents, videos } } so the client can
// render counts without re-querying.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const single = searchParams.get('skuId');
  const batch = searchParams.get('skuIds');

  // Single-sku mode — flat lists of documents + videos.
  if (single && !batch) {
    const [docLinks, vidLinks] = await Promise.all([
      prisma.fileAssetSku.findMany({
        where: { skuId: single },
        include: {
          fileAsset: {
            select: {
              id: true,
              name: true,
              driveFileId: true,
              mimeType: true,
              sizeBytes: true,
              folderId: true,
            },
          },
        },
      }),
      prisma.videoAssetSku.findMany({
        where: { skuId: single },
        include: {
          videoAsset: {
            select: {
              id: true,
              title: true,
              vimeoUrl: true,
              vimeoId: true,
              folderId: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      skuId: single,
      documents: docLinks.map((l) => ({
        ...l.fileAsset,
        sizeBytes: Number(l.fileAsset.sizeBytes),
      })),
      videos: vidLinks.map((l) => l.videoAsset),
    });
  }

  // Batch mode — { [skuId]: { documents, videos } }
  const ids = (batch ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Missing skuId or skuIds' }, { status: 400 });
  }

  const [docLinks, vidLinks] = await Promise.all([
    prisma.fileAssetSku.findMany({
      where: { skuId: { in: ids } },
      include: {
        fileAsset: {
          select: {
            id: true,
            name: true,
            driveFileId: true,
            mimeType: true,
            sizeBytes: true,
            folderId: true,
          },
        },
      },
    }),
    prisma.videoAssetSku.findMany({
      where: { skuId: { in: ids } },
      include: {
        videoAsset: {
          select: {
            id: true,
            title: true,
            vimeoUrl: true,
            vimeoId: true,
            folderId: true,
          },
        },
      },
    }),
  ]);

  const out: Record<string, { documents: any[]; videos: any[] }> = {};
  for (const id of ids) out[id] = { documents: [], videos: [] };
  for (const l of docLinks) {
    out[l.skuId]?.documents.push({
      ...l.fileAsset,
      sizeBytes: Number(l.fileAsset.sizeBytes),
    });
  }
  for (const l of vidLinks) {
    out[l.skuId]?.videos.push(l.videoAsset);
  }

  return NextResponse.json(out);
}
