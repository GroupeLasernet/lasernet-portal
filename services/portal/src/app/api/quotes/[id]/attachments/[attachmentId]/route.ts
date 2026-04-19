import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/quotes/[id]/attachments/[attachmentId] — download the file bytes
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  try {
    const att = await prisma.quoteAttachment.findUnique({
      where: { id: params.attachmentId },
    });
    if (!att || att.quoteId !== params.id) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const buf = Buffer.from(att.data, 'base64');
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': att.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(att.filename)}"`,
        'Content-Length': String(att.size),
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/quotes/[id]/attachments/[attachmentId] — remove
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  try {
    const att = await prisma.quoteAttachment.findUnique({
      where: { id: params.attachmentId },
    });
    if (!att || att.quoteId !== params.id) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    await prisma.quoteAttachment.delete({ where: { id: params.attachmentId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
