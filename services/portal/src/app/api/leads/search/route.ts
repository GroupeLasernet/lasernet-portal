// ============================================================
// /api/leads/search?q=... — Search leads by name, email, company
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ leads: [] });
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      },
      select: { id: true, name: true, email: true, phone: true, company: true, photo: true },
      take: 15,
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ leads });
  } catch (error) {
    console.error('GET /api/leads/search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
