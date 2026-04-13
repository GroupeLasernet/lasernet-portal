import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// POST /api/training/events/:id/attendees — add attendees to an event
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { attendees } = body;
    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      return NextResponse.json({ error: 'Attendees array is required' }, { status: 400 });
    }

    const created = await Promise.all(
      attendees.map((a: { contactId: string; name: string; email: string }) =>
        db.trainingAttendee.upsert({
          where: { eventId_contactId: { eventId: id, contactId: a.contactId } },
          update: {},
          create: { eventId: id, contactId: a.contactId, name: a.name, email: a.email },
        })
      )
    );

    return NextResponse.json({ attendees: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/training/events/:id/attendees — remove an attendee
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');
    if (!contactId) return NextResponse.json({ error: 'contactId is required' }, { status: 400 });

    await db.trainingAttendee.delete({
      where: { eventId_contactId: { eventId: id, contactId } },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
