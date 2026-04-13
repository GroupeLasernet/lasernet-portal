import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// GET /api/training/events — list all events
export async function GET() {
  try {
    const events = await db.trainingEvent.findMany({
      include: {
        template: { select: { id: true, name: true } },
        attendees: true,
        files: true,
      },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json({ events });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/training/events — create an event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, date, templateId, attendees } = body;
    if (!title || !date) return NextResponse.json({ error: 'Title and date are required' }, { status: 400 });

    const event = await db.trainingEvent.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        templateId: templateId || null,
        ...(attendees && attendees.length > 0 && {
          attendees: {
            create: attendees.map((a: { contactId: string; name: string; email: string }) => ({
              contactId: a.contactId,
              name: a.name,
              email: a.email,
            })),
          },
        }),
      },
      include: { attendees: true, template: true, files: true },
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
