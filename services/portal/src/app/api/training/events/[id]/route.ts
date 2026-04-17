import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// GET /api/training/events/:id
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const event = await db.trainingEvent.findUnique({
      where: { id },
      include: { template: true, attendees: true, files: true },
    });
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ event });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/training/events/:id
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const body = await request.json();
    const { title, description, date, status, templateId, duration, managedClientId } = body;
    const event = await db.trainingEvent.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(status !== undefined && { status }),
        ...(templateId !== undefined && { templateId }),
        ...(duration !== undefined && { duration: duration ? parseInt(duration) : null }),
        ...(managedClientId !== undefined && { managedClientId: managedClientId || null }),
      },
      include: { attendees: true, template: true, files: true, managedClient: { select: { id: true, displayName: true, companyName: true } } },
    });
    return NextResponse.json({ event });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/training/events/:id
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    await db.trainingEvent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
