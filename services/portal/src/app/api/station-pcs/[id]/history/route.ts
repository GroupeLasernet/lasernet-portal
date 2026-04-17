import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/station-pcs/[id]/history — ordered list of assign/detach events
// for a Station PC. Used by the admin detail panel to show where the PC
// was deployed before, who moved it, and why.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const pc = await prisma.stationPC.findUnique({ where: { id } });
    if (!pc) {
      return NextResponse.json({ error: 'Station PC not found' }, { status: 404 });
    }

    const rows = await prisma.stationPCAssignment.findMany({
      where: { stationPCId: id },
      orderBy: { createdAt: 'desc' },
    });

    const history = rows.map((r) => ({
      id: r.id,
      action: r.action,
      reason: r.reason,
      stationId: r.stationId,
      stationNumber: r.stationNumber,
      stationTitle: r.stationTitle,
      actorEmail: r.actorEmail,
      actorName: r.actorName,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error fetching station PC history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
