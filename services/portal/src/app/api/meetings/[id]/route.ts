// ============================================================
// /api/meetings/[id] — PATCH (update) and DELETE
//
// When completing (status='completed'), caller must supply
// mainContactId (attendee ID) — the chosen attendee becomes
// the project's lead. If the attendee has no leadId we create
// a new Lead from their name/email first.
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

  const { title, scheduledAt, durationMinutes, location, notes, status, mainContactAttendeeId } = body;

  // ── Completing a meeting requires picking a main contact ──
  if (status === 'completed') {
    if (!mainContactAttendeeId) {
      return NextResponse.json(
        { error: 'You must select a main contact before completing the meeting.' },
        { status: 400 }
      );
    }

    // Fetch the meeting + attendee
    const mtg = await prisma.projectMeeting.findUnique({
      where: { id: params.id },
      include: { attendees: true },
    });
    if (!mtg) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

    const attendee = mtg.attendees.find(a => a.id === mainContactAttendeeId);
    if (!attendee) {
      return NextResponse.json({ error: 'Attendee not found in this meeting.' }, { status: 400 });
    }

    // Resolve leadId — create a Lead if the attendee is free-text only
    let leadId = attendee.leadId;
    if (!leadId) {
      const newLead = await prisma.lead.create({
        data: {
          name: attendee.name || 'Unknown',
          email: attendee.email || null,
          stage: 'new',
          source: 'walk_in',
        },
      });
      leadId = newLead.id;
      // Link the attendee to the new lead
      await prisma.meetingAttendee.update({
        where: { id: attendee.id },
        data: { leadId },
      });
    }

    // Update the project's main contact (leadId)
    await prisma.leadProject.update({
      where: { id: mtg.projectId },
      data: { leadId },
    });

    // Mark meeting completed
    const meeting = await prisma.projectMeeting.update({
      where: { id: params.id },
      data: { status: 'completed' },
      include: {
        attendees: {
          include: { lead: { select: { id: true, name: true, email: true, phone: true, company: true, photo: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ meeting, mainContactLeadId: leadId });
  }

  // ── Normal (non-completion) update ──
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
