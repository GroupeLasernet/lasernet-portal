import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/projects/[id]/quotes/[quoteId]/duplicate
// Body: { itemIds?: string[] }
// If itemIds is provided, only those items are copied to the new quote.
// If omitted, all items are copied.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; quoteId: string } }
) {
  try {
    const { id: projectId, quoteId } = params;
    const body = await request.json().catch(() => ({}));
    const selectedItemIds: string[] | undefined = body.itemIds;

    const original = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!original) {
      return NextResponse.json({ error: 'Original quote not found' }, { status: 404 });
    }

    // Filter items if a selection was provided
    const itemsToCopy = selectedItemIds
      ? original.items.filter((item) => selectedItemIds.includes(item.id))
      : original.items;

    // Generate new quote number
    const year = new Date().getFullYear();
    const count = await prisma.quote.count();
    const newNumber = `Q-${year}-${String(count + 1).padStart(3, '0')}`;

    const duplicate = await prisma.quote.create({
      data: {
        projectId,
        quoteNumber: newNumber,
        status: 'draft',
        notes: original.notes,
        parentQuoteId: original.id,
        items: {
          create: itemsToCopy.map((item, idx) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unit: item.unit,
            notes: item.notes,
            sortOrder: idx,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    return NextResponse.json({ quote: duplicate }, { status: 201 });
  } catch (error) {
    console.error('Error duplicating quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
