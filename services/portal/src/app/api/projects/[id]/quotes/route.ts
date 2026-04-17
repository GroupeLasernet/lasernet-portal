import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/projects/[id]/quotes — Create a new quote with items
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { quoteNumber, notes, items } = body;

    const project = await prisma.leadProject.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Auto-generate quote number if not provided
    const finalNumber = quoteNumber?.trim() || await generateQuoteNumber();

    const quote = await prisma.quote.create({
      data: {
        projectId: id,
        quoteNumber: finalNumber,
        notes: notes || null,
        items: Array.isArray(items) && items.length > 0
          ? {
              create: items.map((item: { description: string; quantity?: number; unitPrice?: number; unit?: string; notes?: string }, idx: number) => ({
                description: item.description,
                quantity: item.quantity ?? 1,
                unitPrice: item.unitPrice ?? 0,
                unit: item.unit || null,
                notes: item.notes || null,
                sortOrder: idx,
              })),
            }
          : undefined,
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    console.error('Error creating quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.quote.count();
  return `Q-${year}-${String(count + 1).padStart(3, '0')}`;
}
