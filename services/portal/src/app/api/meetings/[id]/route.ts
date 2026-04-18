// ============================================================
// /api/meetings/[id] — PATCH (update) and DELETE
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, scheduledAt, durationMinutes, location, notes, status } = body;

  try {
    const meeting = await prisma.projectMeeting.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(scheduledAt !== undefined && { scheduledAt: new Date(scheduledAt) }),
        ...(durationMinutes !== undefined && { durationMinutes }),
        ...(location !== undefined && { location }),
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
      },
      include: {
        attendees: {
          include: { lead: { select: { id: true, name: true, email: true, phone: true, company: true, photo: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ meeting });
  } catch (error) {
    console.error('PATCH /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    await prisma.projectMeeting.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
