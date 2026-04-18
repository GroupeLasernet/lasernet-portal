// ============================================================
// /api/meetings/[id]/attendees — GET, POST (add), DELETE (remove)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const attendees = await prisma.meetingAttendee.findMany({
      where: { meetingId: params.id },
      include: { lead: { select: { id: true, name: true, email: true, phone: true, company: true, photo: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ attendees });
  } catch (error) {
    console.error('GET /api/meetings/[id]/attendees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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

  const { leadId, name, email } = body;

  if (!leadId && !name) {
    return NextResponse.json({ error: 'leadId or name is required' }, { status: 400 });
  }

  try {
    // If leadId provided, check for duplicate
    if (leadId) {
      const existing = await prisma.meetingAttendee.findUnique({
        where: { meetingId_leadId: { meetingId: params.id, leadId } },
      });
      if (existing) {
        return NextResponse.json({ error: 'Attendee already added' }, { status: 409 });
      }
    }

    const attendee = await prisma.meetingAttendee.create({
      data: {
        meetingId: params.id,
        leadId: leadId || null,
        name: name || null,
        email: email || null,
      },
      include: { lead: { select: { id: true, name: true, email: true, phone: true, company: true, photo: true } } },
    });

    return NextResponse.json({ attendee }, { status: 201 });
  } catch (error) {
    console.error('POST /api/meetings/[id]/attendees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const attendeeId = searchParams.get('attendeeId');

  if (!attendeeId) {
    return NextResponse.json({ error: 'attendeeId query param required' }, { status: 400 });
  }

  try {
    await prisma.meetingAttendee.delete({ where: { id: attendeeId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/meetings/[id]/attendees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
