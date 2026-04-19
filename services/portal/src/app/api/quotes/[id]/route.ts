import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/quotes/[id] — Fetch single quote with items
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: params.id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        project: {
          include: {
            lead: {
              select: {
                id: true,
                name: true,
                email: true,
                company: true,
                managedClientId: true,
                managedClient: {
                  select: {
                    id: true,
                    qbId: true,
                    displayName: true,
                    companyName: true,
                  },
                },
              },
            },
          },
        },
      },
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

// PATCH /api/quotes/[id] — Update quote fields + items
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status, notes, expiresAt, items } = body;

    const existing = await prisma.quote.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Update quote fields
    const updateData: any = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'accepted') updateData.acceptedAt = new Date();
      if (status === 'refused') updateData.rejectedAt = new Date();
      if (status === 'pending') updateData.sentAt = new Date();
    }
    if (notes !== undefined) updateData.notes = notes || null;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

    // If items are provided, replace all items
    if (Array.isArray(items)) {
      await prisma.quoteItem.deleteMany({ where: { quoteId: params.id } });
      if (items.length > 0) {
        await prisma.quoteItem.createMany({
          data: items.map((item: any, idx: number) => ({
            quoteId: params.id,
            description: item.description || '',
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? 0,
            unit: item.unit || null,
            notes: item.notes || null,
            sortOrder: idx,
          })),
        });
      }
    }

    const quote = await prisma.quote.update({
      where: { id: params.id },
      data: updateData,
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        project: {
          include: {
            lead: {
              select: {
                id: true,
                name: true,
                company: true,
                managedClientId: true,
                managedClient: {
                  select: {
                    id: true,
                    qbId: true,
                    displayName: true,
                    companyName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ quote });
  } catch (error) {
    console.error('Error updating quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/quotes/[id] — Delete a quote
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.quote.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
