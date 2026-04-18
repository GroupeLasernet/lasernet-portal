// ============================================================
// /api/improvements — GET (list) and POST (create)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  try {
    const where: any = {};
    if (status) where.status = status;

    const improvements = await prisma.improvement.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [
        { priority: 'asc' },   // critical first (alphabetical: critical < high < low < medium — we sort in UI)
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({ improvements });
  } catch (error) {
    console.error('GET /api/improvements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, description, priority } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const improvement = await prisma.improvement.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'medium',
        createdById: guard.user.userId ?? guard.user.id ?? '',
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ improvement }, { status: 201 });
  } catch (error) {
    console.error('POST /api/improvements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
