// ============================================================
// /api/visit-groups/carried-over — GET (admin)
//
// Lists VisitGroups that are still status='active' but started
// before the start of today (i.e. operator forgot to finalize
// them before moving to the next day).
//
// Same idea applies to ProjectMeetings with status='scheduled'
// whose scheduledAt is before today — those are rolled into the
// same carried-over feed, tagged so the UI can route the click
// to the right finalize endpoint.
//
// Added 2026-04-20.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  // Start of today in server time. Good enough for "previous day" rollover.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  try {
    const [visitGroups, meetings] = await Promise.all([
      prisma.visitGroup.findMany({
        where: {
          status: 'active',
          createdAt: { lt: startOfToday },
        },
        include: {
          managedClient: { select: { id: true, companyName: true, displayName: true } },
          localBusiness: { select: { id: true, name: true } },
          visits: { select: { visitorName: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.projectMeeting.findMany({
        where: {
          status: 'scheduled',
          scheduledAt: { lt: startOfToday },
        },
        include: {
          project: { select: { id: true, name: true } },
          attendees: { select: { lead: { select: { name: true } }, name: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    const vgItems = visitGroups.map((vg) => ({
      kind: 'visitGroup' as const,
      id: vg.id,
      title:
        vg.managedClient?.companyName ||
        vg.managedClient?.displayName ||
        vg.localBusiness?.name ||
        vg.displayName ||
        'Unassigned visit',
      startedAt: vg.createdAt,
      peopleCount: vg.visits.length,
      peoplePreview: vg.visits.map((v) => v.visitorName).slice(0, 3),
    }));

    const mtgItems = meetings.map((m) => ({
      kind: 'meeting' as const,
      id: m.id,
      title: `${m.title} — ${m.project?.name || 'Untitled project'}`,
      startedAt: m.scheduledAt,
      peopleCount: m.attendees.length,
      peoplePreview: m.attendees
        .map((a) => a.lead?.name || a.name || '?')
        .slice(0, 3),
    }));

    return NextResponse.json({ items: [...vgItems, ...mtgItems] });
  } catch (e: any) {
    console.error('GET /api/visit-groups/carried-over error:', e);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}
