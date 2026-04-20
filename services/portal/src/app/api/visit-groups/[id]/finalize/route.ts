// ============================================================
// /api/visit-groups/[id]/finalize — POST (admin)
//
// Runs the shared finalize transaction (see lib/finalizeVisit.ts)
// then closes out the VisitGroup (status='completed', mainContactId,
// completedAt, expectedFollowUpAt default = today + 7 days).
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

  const vg = await prisma.visitGroup.findUnique({
    where: { id: params.id },
    select: { id: true, managedClientId: true, localBusinessId: true, status: true },
  });
  if (!vg) return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });

  const input: FinalizeInput = {
    managedClientId: vg.managedClientId,
    localBusinessId: vg.localBusinessId,
    people: body.people || [],
    mainContact: body.mainContact,
    project: body.project,
    actor: {
      id: guard.user.userId ?? guard.user.id ?? null,
      name: guard.user.name || 'Unknown',
    },
  };

  // Basic validation
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

    // Close out the visit group
    const followUp = new Date();
    followUp.setDate(followUp.getDate() + 7);
    await prisma.visitGroup.update({
      where: { id: params.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        mainContactId: result.mainContactLeadId,
        expectedFollowUpAt: followUp,
      },
    });

    return NextResponse.json({
      success: true,
      projectId: result.projectId,
      mainContactLeadId: result.mainContactLeadId,
      attachedLeadIds: result.attachedLeadIds,
      createdLeadIds: result.createdLeadIds,
    });
  } catch (e: any) {
    console.error('POST /api/visit-groups/[id]/finalize error:', e);
    return NextResponse.json({ error: e?.message || 'Finalize failed' }, { status: 500 });
  }
}
