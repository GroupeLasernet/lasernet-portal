// ============================================================
// /api/visit-groups/[id] — GET, PATCH, DELETE
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    const visitGroup = await prisma.visitGroup.findUnique({
      where: { id: params.id },
      include: {
        visits: {
          include: {
            lead: {
              select: { id: true, name: true, email: true, photo: true, company: true },
            },
          },
        },
        managedClient: true,
        localBusiness: true,
        files: true,
        needs: true,
        _count: { select: { visits: true } },
      },
    });

    if (!visitGroup) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });
    }

    return NextResponse.json({ visitGroup });
  } catch (error) {
    console.error('GET /api/visit-groups/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { managedClientId, localBusinessId, mainContactId, status, notes, expectedFollowUpAt } = body;

  try {
    const current = await prisma.visitGroup.findUnique({ where: { id: params.id } });
    if (!current) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });
    }

    const data: any = {};
    if (managedClientId !== undefined) data.managedClientId = managedClientId || null;
    if (localBusinessId !== undefined) data.localBusinessId = localBusinessId || null;
    if (mainContactId !== undefined) data.mainContactId = mainContactId || null;
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes || null;
    if (expectedFollowUpAt !== undefined) {
      data.expectedFollowUpAt = expectedFollowUpAt ? new Date(expectedFollowUpAt) : null;
    }

    // Auto-set completedAt when status changes to "completed"
    if (status === 'completed' && current.status !== 'completed') {
      data.completedAt = new Date();
    }

    const visitGroup = await prisma.visitGroup.update({
      where: { id: params.id },
      data,
      include: {
        visits: {
          include: {
            lead: {
              select: { id: true, name: true, email: true, photo: true, company: true },
            },
          },
        },
        managedClient: true,
        localBusiness: true,
        files: true,
        needs: true,
        _count: { select: { visits: true } },
      },
    });

    return NextResponse.json({ visitGroup });
  } catch (error) {
    console.error('PATCH /api/visit-groups/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    await prisma.visitGroup.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/visit-groups/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
