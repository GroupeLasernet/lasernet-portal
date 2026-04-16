// ============================================================
// /api/visit-groups — GET (list) and POST (create)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const date = searchParams.get('date');

  try {
    const where: any = {};
    if (status) where.status = status;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }

    const visitGroups = await prisma.visitGroup.findMany({
      where,
      include: {
        visits: {
          include: {
            lead: {
              select: { id: true, name: true, email: true, photo: true, company: true },
            },
          },
        },
        managedClient: {
          select: {
            id: true,
            displayName: true,
            companyName: true,
            address: true,
            city: true,
            province: true,
            postalCode: true,
          },
        },
        localBusiness: true,
        needs: true,
        _count: { select: { files: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ visitGroups });
  } catch (error) {
    console.error('GET /api/visit-groups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { managedClientId, localBusinessId, notes } = body;

  try {
    const visitGroup = await prisma.visitGroup.create({
      data: {
        managedClientId: managedClientId || null,
        localBusinessId: localBusinessId || null,
        notes: notes || null,
      },
      include: {
        visits: true,
        managedClient: {
          select: {
            id: true,
            displayName: true,
            companyName: true,
            address: true,
            city: true,
            province: true,
            postalCode: true,
          },
        },
        localBusiness: true,
        needs: true,
        _count: { select: { files: true } },
      },
    });

    return NextResponse.json({ visitGroup }, { status: 201 });
  } catch (error) {
    console.error('POST /api/visit-groups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
