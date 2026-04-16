// ============================================================
// /api/visit-groups/[id]/needs — GET (list) and POST (create)
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
    const visitGroup = await prisma.visitGroup.findUnique({ where: { id: params.id } });
    if (!visitGroup) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });
    }

    const needs = await prisma.visitNeed.findMany({
      where: { visitGroupId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ needs });
  } catch (error) {
    console.error('GET /api/visit-groups/[id]/needs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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

  const { type, description, expectedDate, assignedToId, notes } = body;

  if (!type) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 });
  }

  try {
    const visitGroup = await prisma.visitGroup.findUnique({ where: { id: params.id } });
    if (!visitGroup) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });
    }

    const need = await prisma.visitNeed.create({
      data: {
        visitGroupId: params.id,
        type,
        description: description || null,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        assignedToId: assignedToId || null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ need }, { status: 201 });
  } catch (error) {
    console.error('POST /api/visit-groups/[id]/needs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
