import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// PATCH /api/projects/[id]/quotes/[quoteId]/items/[itemId] — Update an item
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; quoteId: string; itemId: string } }
) {
  try {
    const { itemId } = params;
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.description !== undefined) data.description = body.description;
    if (body.quantity !== undefined) data.quantity = body.quantity;
    if (body.unitPrice !== undefined) data.unitPrice = body.unitPrice;
    if (body.unit !== undefined) data.unit = body.unit || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    const item = await prisma.quoteItem.update({
      where: { id: itemId },
      data,
    });
    return NextResponse.json({ item });
  } catch (error) {
    console.error('Error updating quote item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/quotes/[quoteId]/items/[itemId] — Remove an item
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; quoteId: string; itemId: string } }
) {
  try {
    const { itemId } = params;
    await prisma.quoteItem.delete({ where: { id: itemId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting quote item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
