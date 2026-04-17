import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/kiosk/expected-meetings — Public endpoint returning today's
// pre-registered visit groups (e.g. from training events) so the kiosk
// can show a list of expected visitors who can check in with one tap.
export async function GET() {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Find visit groups created today that have a trainingEventId (auto-generated
    // from training) or that are still active with pre-filled visitors.
    const groups = await prisma.visitGroup.findMany({
      where: {
        status: 'active',
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      include: {
        visits: {
          include: { lead: { select: { id: true, name: true, email: true, phone: true } } },
        },
        trainingEvent: { select: { title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Only return groups that have pre-registered visitors (not empty groups)
    const meetings = groups
      .filter(g => g.visits.length > 0)
      .map(g => ({
        groupId: g.id,
        displayName: g.displayName || g.trainingEvent?.title || `Meeting ${g.id.slice(-4)}`,
        visitors: g.visits.map(v => ({
          id: v.id,
          name: v.visitorName || v.lead?.name || '',
          email: v.visitorEmail || v.lead?.email || null,
          phone: v.visitorPhone || v.lead?.phone || null,
          leadId: v.leadId,
        })),
      }));

    return NextResponse.json({ meetings });
  } catch (error) {
    console.error('Error fetching expected meetings:', error);
    return NextResponse.json({ meetings: [] });
  }
}

export const dynamic = 'force-dynamic';
