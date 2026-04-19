import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/quotes — List all quotes across all projects
export async function GET() {
  try {
    const quotes = await prisma.quote.findMany({
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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ quotes });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/quotes — Create a new quote (picks project by projectId in body)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, notes, expiresAt, items } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const project = await prisma.leadProject.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Auto-generate quote number
    const year = new Date().getFullYear();
    const count = await prisma.quote.count();
    const quoteNumber = `Q-${year}-${String(count + 1).padStart(3, '0')}`;

    const quote = await prisma.quote.create({
      data: {
        projectId,
        quoteNumber,
        status: 'draft',
        notes: notes || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        items: Array.isArray(items) && items.length > 0
          ? {
              create: items.map((item: any, idx: number) => ({
                description: item.description || '',
                quantity: item.quantity ?? 1,
                unitPrice: item.unitPrice ?? 0,
                unit: item.unit || null,
                notes: item.notes || null,
                sortOrder: idx,
              })),
            }
          : undefined,
      },
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

    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    console.error('Error creating quote:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
