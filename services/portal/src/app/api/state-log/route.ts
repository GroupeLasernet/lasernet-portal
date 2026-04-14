import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/state-log — Query state logs with filters
// Accepts either `stationId` (preferred) or legacy `jobId` (kept for
// backward compatibility with the robot/relfar services until they
// are updated to speak "station").
export async function GET(request: NextRequest) {
  try {
    const source = request.nextUrl.searchParams.get('source');
    const stationId =
      request.nextUrl.searchParams.get('stationId') ??
      request.nextUrl.searchParams.get('jobId');
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');
    const limit = request.nextUrl.searchParams.get('limit');

    const where: any = {};

    if (source) {
      where.source = source;
    }

    if (stationId) {
      where.stationId = stationId;
    }

    if (from || to) {
      where.timestamp = {};
      if (from) {
        where.timestamp.gte = new Date(from);
      }
      if (to) {
        where.timestamp.lte = new Date(to);
      }
    }

    const take = limit ? Math.min(parseInt(limit), 1000) : 100;

    const logs = await prisma.machineStateLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take,
    });

    const result = logs.map((log) => ({
      id: log.id,
      stationId: log.stationId,
      // Back-compat alias so existing clients don't break:
      jobId: log.stationId,
      source: log.source,
      data: JSON.parse(log.data),
      timestamp: log.timestamp.toISOString(),
    }));

    return NextResponse.json({ logs: result, count: result.length });
  } catch (error) {
    console.error('Error fetching state logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/state-log — Record a state snapshot
// Accepts either `stationId` (preferred) or legacy `jobId`.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, data } = body;
    const stationId: string | undefined = body.stationId ?? body.jobId;

    if (!source) {
      return NextResponse.json({ error: 'source is required' }, { status: 400 });
    }

    if (stationId) {
      const station = await prisma.station.findUnique({
        where: { id: stationId },
      });

      if (!station) {
        return NextResponse.json({ error: 'Station not found' }, { status: 404 });
      }
    }

    const log = await prisma.machineStateLog.create({
      data: {
        stationId: stationId || null,
        source,
        data: typeof data === 'string' ? data : JSON.stringify(data || {}),
      },
    });

    const result = {
      id: log.id,
      stationId: log.stationId,
      jobId: log.stationId, // back-compat alias
      source: log.source,
      data: JSON.parse(log.data),
      timestamp: log.timestamp.toISOString(),
    };

    return NextResponse.json({ log: result }, { status: 201 });
  } catch (error) {
    console.error('Error recording state log:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
