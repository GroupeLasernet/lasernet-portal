// ============================================================
// /api/kiosk/search — GET (public, no auth)
// Search existing leads by name for kiosk quick check-in.
// Returns whether each lead is currently in an active visit.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const leads = await prisma.lead.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        photo: true,
        visits: {
          where: {
            visitedAt: { gte: todayStart },
            visitGroup: { status: 'active' },
          },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    const results = leads.map(lead => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      company: lead.company,
      photo: lead.photo,
      activeVisit: lead.visits.length > 0,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('GET /api/kiosk/search error:', error);
    return NextResponse.json({ results: [] });
  }
}
