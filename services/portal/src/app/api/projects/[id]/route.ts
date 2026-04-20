import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// ============================================================
// GET /api/projects/[id]
// ------------------------------------------------------------
// Returns the project with its full lead set (via assignments),
// its quotes, and any meetings.
// ============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const project = await prisma.leadProject.findUnique({
      where: { id },
      include: {
        quotes: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
        assignments: {
          orderBy: { createdAt: 'asc' },
          include: { lead: true },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// PATCH /api/projects/[id]
// ------------------------------------------------------------
// Standard fields: name/status/notes/callbackReason/suggestedProducts/
// objective/budget/refuseAllQuotes.
//
// NEW: `leadIds` — when provided, replaces the full set of leads on
// the project (via LeadProjectAssignment). Must include ≥1 lead.
// If the primary (LeadProject.leadId) is removed from the set,
// we pick one of the remaining leads as the new primary so the
// legacy field stays populated.
// ============================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name.trim();
    if (body.status !== undefined) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.callbackReason !== undefined) data.callbackReason = body.callbackReason || null;
    if (body.suggestedProducts !== undefined) data.suggestedProducts = body.suggestedProducts || null;
    if (body.objective !== undefined) data.objective = body.objective || null;
    if (body.budget !== undefined) data.budget = body.budget != null ? parseFloat(String(body.budget)) : null;

    // Refuse-all-quotes toggle — unchanged semantics.
    if (body.refuseAllQuotes) {
      await prisma.quote.updateMany({
        where: { projectId: id },
        data: { status: 'refused' },
      });
    }

    // Sync the leads set if provided. De-dupe, drop empties, require ≥1.
    let syncedLeadIds: string[] | null = null;
    if (Array.isArray(body.leadIds)) {
      const clean = Array.from(new Set((body.leadIds as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim().length > 0
      )));
      if (clean.length === 0) {
        return NextResponse.json(
          { error: 'A project must have at least one lead.' },
          { status: 400 }
        );
      }
      syncedLeadIds = clean;
    }

    // Run the writes in a transaction so the assignment table and the
    // legacy `leadId` field never disagree.
    const project = await prisma.$transaction(async (tx) => {
      if (syncedLeadIds) {
        // Verify every lead exists before we touch anything.
        const existing = await tx.lead.findMany({
          where: { id: { in: syncedLeadIds } },
          select: { id: true },
        });
        if (existing.length !== syncedLeadIds.length) {
          throw new Error('One or more leads not found.');
        }

        // Reset the join table to match the new set.
        await tx.leadProjectAssignment.deleteMany({
          where: { projectId: id, leadId: { notIn: syncedLeadIds } },
        });
        for (const leadId of syncedLeadIds) {
          await tx.leadProjectAssignment.upsert({
            where: { projectId_leadId: { projectId: id, leadId } },
            create: { projectId: id, leadId },
            update: {},
          });
        }

        // Ensure the primary leadId points at a member of the set.
        const current = await tx.leadProject.findUnique({
          where: { id },
          select: { leadId: true },
        });
        if (current && !syncedLeadIds.includes(current.leadId)) {
          data.leadId = syncedLeadIds[0];
        }
      }

      return tx.leadProject.update({
        where: { id },
        data,
        include: {
          quotes: {
            include: { items: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { createdAt: 'desc' },
          },
          assignments: {
            orderBy: { createdAt: 'asc' },
            include: { lead: true },
          },
        },
      });
    });

    return NextResponse.json({ project });
  } catch (error: any) {
    console.error('Error updating project:', error);
    const msg = error?.message || 'Internal server error';
    const status = /not found/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// ============================================================
// DELETE /api/projects/[id] — cascades to quotes + assignments.
// ============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.leadProject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
