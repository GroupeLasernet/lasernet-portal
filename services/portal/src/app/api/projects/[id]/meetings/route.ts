// ============================================================
// /api/projects/[id]/meetings — GET (list) and POST (create)
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
    const meetings = await prisma.projectMeeting.findMany({
      where: { projectId: params.id },
      include: {
        attendees: {
          include: { lead: { select: { id: true, name: true, email: true, phone: true, company: true, photo: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    return NextResponse.json({ meetings });
  } catch (error) {
    console.error('GET /api/projects/[id]/meetings error:', error);
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

  const { title, scheduledAt, durationMinutes, location, notes } = body;

  if (!title || !scheduledAt) {
    return NextResponse.json({ error: 'title and scheduledAt are required' }, { status: 400 });
  }

  try {
    // Verify the project exists and get lead ID for activity log
    const project = await prisma.leadProject.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, leadId: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const meeting = await prisma.projectMeeting.create({
      data: {
        projectId: params.id,
        title,
        scheduledAt: new Date(scheduledAt),
        durationMinutes: durationMinutes || 60,
        location: location || null,
        notes: notes || null,
        createdById: guard.user.userId ?? guard.user.id ?? null,
      },
      include: {
        attendees: {
          include: { lead: { select: { id: true, name: true, email: true, phone: true, company: true, photo: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: project.leadId,
        actorId: guard.user.userId ?? guard.user.id ?? '',
        actorName: guard.user.name,
        type: 'meeting_scheduled',
        description: `Meeting "${title}" scheduled for ${new Date(scheduledAt).toLocaleDateString()} — project: ${project.name}`,
      },
    });

    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects/[id]/meetings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
