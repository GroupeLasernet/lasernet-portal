import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/projects/[id]/quotes/[quoteId] — Get quote with items
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; quoteId: string } }
) {
  try {
    const { quoteId } = params;
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    return NextResponse.json({ quote });
  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/quotes/[quoteId] — Update quote fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; quoteId: string } }
) {
  try {
    const { quoteId } = params;
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.quoteNumber !== undefined) data.quoteNumber = body.quoteNumber;
    if (body.status !== undefined) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.sentAt !== undefined) data.sentAt = body.sentAt ? new Date(body.sentAt) : null;
    if (body.acceptedAt !== undefined) data.acceptedAt = body.acceptedAt ? new Date(body.acceptedAt) : null;
    if (body.rejectedAt !== undefined) data.rejectedAt = body.rejectedAt ? new Date(body.rejectedAt) : null;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const quote = await prisma.quote.update({
      where: { id: quoteId },
      data,
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    return NextResponse.json({ quote });
  } catch (error) {
    console.error('Error updating quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/quotes/[quoteId] — Delete a quote
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; quoteId: string } }
) {
  try {
    const { quoteId } = params;
    await prisma.quote.delete({ where: { id: quoteId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
