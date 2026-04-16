// ============================================================
// /api/kiosk/search — GET (public, no auth)
// Search existing leads by name for kiosk quick check-in.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
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
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    return NextResponse.json({ results: leads });
  } catch (error) {
    console.error('GET /api/kiosk/search error:', error);
    return NextResponse.json({ results: [] });
  }
}
