// ============================================================
// /api/visit-groups/[id]/needs/[needId] — PATCH, DELETE
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; needId: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, description, status, expectedDate, completedAt, assignedToId, notes } = body;

  try {
    const current = await prisma.visitNeed.findUnique({
      where: { id: params.needId },
    });
    if (!current || current.visitGroupId !== params.id) {
      return NextResponse.json({ error: 'Need not found' }, { status: 404 });
    }

    const data: any = {};
    if (type !== undefined) data.type = type;
    if (description !== undefined) data.description = description || null;
    if (status !== undefined) data.status = status;
    if (expectedDate !== undefined) data.expectedDate = expectedDate ? new Date(expectedDate) : null;
    if (completedAt !== undefined) data.completedAt = completedAt ? new Date(completedAt) : null;
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (notes !== undefined) data.notes = notes || null;

    // Auto-set completedAt when status changes to "completed" or "sent"
    if (
      status &&
      (status === 'completed' || status === 'sent') &&
      current.status !== 'completed' &&
      current.status !== 'sent'
    ) {
      data.completedAt = new Date();
    }

    const need = await prisma.visitNeed.update({
      where: { id: params.needId },
      data,
    });

    return NextResponse.json({ need });
  } catch (error) {
    console.error('PATCH /api/visit-groups/[id]/needs/[needId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; needId: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    const need = await prisma.visitNeed.findUnique({ where: { id: params.needId } });
    if (!need || need.visitGroupId !== params.id) {
      return NextResponse.json({ error: 'Need not found' }, { status: 404 });
    }

    await prisma.visitNeed.delete({ where: { id: params.needId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/visit-groups/[id]/needs/[needId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
