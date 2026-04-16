// ============================================================
// /api/visits/[id]/move — PATCH (admin)
// Move a visit from one VisitGroup to another (drag and drop).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { targetGroupId } = body;

  if (!targetGroupId) {
    return NextResponse.json({ error: 'targetGroupId is required' }, { status: 400 });
  }

  try {
    // Verify visit exists
    const visit = await prisma.visit.findUnique({ where: { id } });
    if (!visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // Verify target group exists
    const targetGroup = await prisma.visitGroup.findUnique({ where: { id: targetGroupId } });
    if (!targetGroup) {
      return NextResponse.json({ error: 'Target group not found' }, { status: 404 });
    }

    // Move the visit
    const updated = await prisma.visit.update({
      where: { id },
      data: { visitGroupId: targetGroupId },
    });

    // Clean up: if the old group now has zero visits, delete it
    if (visit.visitGroupId && visit.visitGroupId !== targetGroupId) {
      const remainingVisits = await prisma.visit.count({
        where: { visitGroupId: visit.visitGroupId },
      });
      if (remainingVisits === 0) {
        await prisma.visitGroup.delete({ where: { id: visit.visitGroupId } });
      }
    }

    return NextResponse.json({ success: true, visit: updated });
  } catch (error) {
    console.error('PATCH /api/visits/[id]/move error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
