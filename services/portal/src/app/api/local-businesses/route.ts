// ============================================================
// /api/local-businesses — GET (list/search) and POST (create)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  try {
    const where: any = {};
    if (q) {
      where.name = { contains: q, mode: 'insensitive' };
    }

    const businesses = await prisma.localBusiness.findMany({
      where,
      include: {
        _count: { select: { visitGroups: true, leads: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ businesses });
  } catch (error) {
    console.error('GET /api/local-businesses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, address, city, province, postalCode, country, phone, email, website, notes } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const business = await prisma.localBusiness.create({
      data: {
        name,
        address: address || null,
        city: city || null,
        province: province || null,
        postalCode: postalCode || null,
        country: country || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        notes: notes || null,
      },
      include: {
        _count: { select: { visitGroups: true, leads: true } },
      },
    });

    return NextResponse.json({ business }, { status: 201 });
  } catch (error) {
    console.error('POST /api/local-businesses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
