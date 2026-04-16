// ============================================================
// /api/leads/[id]/visits — GET (list) and POST (log a visit)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const visits = await prisma.visit.findMany({
      where: { leadId: params.id },
      include: { receivedBy: { select: { id: true, name: true } } },
      orderBy: { visitedAt: 'desc' },
    });
    return NextResponse.json({ visits });
  } catch (error) {
    console.error('GET /api/leads/[id]/visits error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { visitorName, visitorEmail, visitorPhone, visitorCompany, visitorPhoto, purpose, notes } = body;

  if (!visitorName) {
    return NextResponse.json({ error: 'visitorName is required' }, { status: 400 });
  }

  try {
    const visit = await prisma.visit.create({
      data: {
        leadId: params.id,
        visitorName,
        visitorEmail: visitorEmail || null,
        visitorPhone: visitorPhone || null,
        visitorCompany: visitorCompany || null,
        visitorPhoto: visitorPhoto || null,
        receivedById: guard.user.userId || guard.user.id,
        purpose: purpose || null,
        notes: notes || null,
      },
      include: { receivedBy: { select: { id: true, name: true } } },
    });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: params.id,
        actorId: guard.user.userId || guard.user.id,
        actorName: guard.user.name,
        type: 'visit_logged',
        description: `Walk-in visit logged for ${visitorName}${purpose ? ` — ${purpose}` : ''}`,
      },
    });

    await prisma.lead.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

    return NextResponse.json({ visit }, { status: 201 });
  } catch (error) {
    console.error('POST /api/leads/[id]/visits error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
