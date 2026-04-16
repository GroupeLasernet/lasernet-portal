// ============================================================
// /api/local-businesses/[id] — GET, PATCH, DELETE
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    const business = await prisma.localBusiness.findUnique({
      where: { id: params.id },
      include: {
        visitGroups: {
          include: {
            _count: { select: { visits: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        leads: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    return NextResponse.json({ business });
  } catch (error) {
    console.error('GET /api/local-businesses/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, address, city, province, postalCode, country, phone, email, website, notes } = body;

  try {
    const current = await prisma.localBusiness.findUnique({ where: { id: params.id } });
    if (!current) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (address !== undefined) data.address = address || null;
    if (city !== undefined) data.city = city || null;
    if (province !== undefined) data.province = province || null;
    if (postalCode !== undefined) data.postalCode = postalCode || null;
    if (country !== undefined) data.country = country || null;
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;
    if (website !== undefined) data.website = website || null;
    if (notes !== undefined) data.notes = notes || null;

    const business = await prisma.localBusiness.update({
      where: { id: params.id },
      data,
      include: {
        _count: { select: { visitGroups: true, leads: true } },
      },
    });

    return NextResponse.json({ business });
  } catch (error) {
    console.error('PATCH /api/local-businesses/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    await prisma.localBusiness.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/local-businesses/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
