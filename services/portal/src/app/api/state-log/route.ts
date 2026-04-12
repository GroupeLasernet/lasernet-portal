import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/state-log — Query state logs with filters
export async function GET(request: NextRequest) {
  try {
    const source = request.nextUrl.searchParams.get('source');
    const jobId = request.nextUrl.searchParams.get('jobId');
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');
    const limit = request.nextUrl.searchParams.get('limit');

    const where: any = {};

    if (source) {
      where.source = source;
    }

    if (jobId) {
      where.jobId = jobId;
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
      jobId: log.jobId,
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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, source, data } = body;

    if (!source) {
      return NextResponse.json({ error: 'source is required' }, { status: 400 });
    }

    if (jobId) {
      // Verify job exists if jobId provided
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
    }

    const log = await prisma.machineStateLog.create({
      data: {
        jobId: jobId || null,
        source,
        data: typeof data === 'string' ? data : JSON.stringify(data || {}),
      },
    });

    const result = {
      id: log.id,
      jobId: log.jobId,
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
