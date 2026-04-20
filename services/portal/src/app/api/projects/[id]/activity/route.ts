// ============================================================
// /api/projects/[id]/activity — GET (activity log for a project)
// ------------------------------------------------------------
// LeadActivity is keyed on leadId, so for a project's activity
// feed we fetch activities across every lead attached to the
// project (primary + co-leads via LeadProjectAssignment) and
// merge them into a single timeline.
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
    const project = await prisma.leadProject.findUnique({
      where: { id: params.id },
      include: {
        assignments: { select: { leadId: true } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Collect every lead tied to the project — the primary leadId +
    // any co-leads from assignments. De-dup in a Set for safety.
    const leadIds = Array.from(
      new Set<string>([project.leadId, ...project.assignments.map((a) => a.leadId)])
    );

    const activities = await prisma.leadActivity.findMany({
      where: { leadId: { in: leadIds } },
      include: {
        actor: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error('GET /api/projects/[id]/activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
