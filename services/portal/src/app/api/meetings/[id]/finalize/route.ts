// ============================================================
// /api/meetings/[id]/finalize — POST (admin)
//
// Same shared finalize flow as /api/visit-groups/[id]/finalize,
// but entry point is a ProjectMeeting. Closes out the meeting
// (status='completed') after syncing people + project.
//
// Added 2026-04-20 as part of the unified end-visit flow.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { runFinalize, type FinalizeInput } from '@/lib/finalizeVisit';

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

  // Resolve business scope via the project's primary lead.
  const mtg = await prisma.projectMeeting.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      project: {
        select: {
          id: true,
          lead: { select: { managedClientId: true, localBusinessId: true } },
        },
      },
    },
  });
  if (!mtg) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  const input: FinalizeInput = {
    managedClientId: mtg.project?.lead?.managedClientId ?? null,
    localBusinessId: mtg.project?.lead?.localBusinessId ?? null,
    people: body.people || [],
    mainContact: body.mainContact,
    project: body.project,
    actor: {
      id: guard.user.userId ?? guard.user.id ?? null,
      name: guard.user.name || 'Unknown',
    },
  };

  if (!input.mainContact) {
    return NextResponse.json({ error: 'mainContact is required' }, { status: 400 });
  }
  if (!input.project) {
    return NextResponse.json({ error: 'project is required' }, { status: 400 });
  }
  if (!Array.isArray(input.people) || input.people.length === 0) {
    return NextResponse.json({ error: 'At least one person must be attached.' }, { status: 400 });
  }

  try {
    const result = await runFinalize(input);

    await prisma.projectMeeting.update({
      where: { id: params.id },
      data: { status: 'completed' },
    });

    return NextResponse.json({
      success: true,
      projectId: result.projectId,
      mainContactLeadId: result.mainContactLeadId,
      attachedLeadIds: result.attachedLeadIds,
      createdLeadIds: result.createdLeadIds,
    });
  } catch (e: any) {
    console.error('POST /api/meetings/[id]/finalize error:', e);
    return NextResponse.json({ error: e?.message || 'Finalize failed' }, { status: 500 });
  }
}
