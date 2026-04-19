import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Max upload size: 10 MB per file (sane for a quote attachment;
// anything larger should go via Vercel Blob in a future migration)
const MAX_SIZE = 10 * 1024 * 1024;

// GET /api/quotes/[id]/attachments — list metadata (not bytes)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const attachments = await prisma.quoteAttachment.findMany({
      where: { quoteId: params.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ attachments });
  } catch (error) {
    console.error('Error listing attachments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/quotes/[id]/attachments — upload a file (multipart/form-data)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const quote = await prisma.quote.findUnique({ where: { id: params.id } });
    if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB)` },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const data = bytes.toString('base64');

    const created = await prisma.quoteAttachment.create({
      data: {
        quoteId: params.id,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        data,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ attachment: created });
  } catch (error: any) {
    console.error('Error uploading attachment:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
