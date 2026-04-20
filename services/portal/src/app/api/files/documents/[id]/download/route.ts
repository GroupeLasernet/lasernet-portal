// ============================================================
// /api/files/documents/[id]/download
// ------------------------------------------------------------
// GET — streams the file bytes back from Google Drive with the
//       Drive-reported mimeType and a Content-Disposition that
//       uses the DB-stored name (so local rename survives).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { downloadFromDrive } from '@/lib/google-drive';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const row = await prisma.fileAsset.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let media;
  try {
    media = await downloadFromDrive(row.driveFileId);
  } catch (e: any) {
    return NextResponse.json({ error: `Drive download failed: ${e.message}` }, { status: 500 });
  }

  // Convert Node Readable → Web ReadableStream for NextResponse
  const nodeStream = media.stream;
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err: any) => controller.error(err));
    },
    cancel() {
      try { (nodeStream as any).destroy?.(); } catch {}
    },
  });

  const headers = new Headers();
  headers.set('Content-Type', media.mimeType);
  // Use the DB-stored name (URL-encoded for non-ASCII safety).
  headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`);
  if (media.size > 0) headers.set('Content-Length', String(media.size));

  return new NextResponse(webStream, { headers });
}
