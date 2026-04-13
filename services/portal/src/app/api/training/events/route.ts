import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// GET /api/training/events — list all events, optionally filtered by clientId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const events = await db.trainingEvent.findMany({
      where: clientId ? { managedClientId: clientId } : undefined,
      include: {
        template: { select: { id: true, name: true } },
        attendees: true,
        files: { select: { id: true, name: true, fileType: true, fileSize: true, createdAt: true } },
        managedClient: { select: { id: true, displayName: true, companyName: true } },
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
    const { title, description, date, templateId, attendees, duration, managedClientId } = body;
    if (!title || !date) return NextResponse.json({ error: 'Title and date are required' }, { status: 400 });

    const event = await db.trainingEvent.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        duration: duration ? parseInt(duration) : null,
        templateId: templateId || null,
        managedClientId: managedClientId || null,
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
      include: { attendees: true, template: true, files: true, managedClient: { select: { id: true, displayName: true, companyName: true } } },
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
