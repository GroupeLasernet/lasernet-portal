// ============================================================
// /api/leads/[id]/calls — GET (list) and POST (log a call)
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
    const calls = await prisma.call.findMany({
      where: { leadId: params.id },
      include: { loggedBy: { select: { id: true, name: true } } },
      orderBy: { calledAt: 'desc' },
    });
    return NextResponse.json({ calls });
  } catch (error) {
    console.error('GET /api/leads/[id]/calls error:', error);
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

  const { type, clientType, duration, notes, outcome, calledAt } = body;

  if (!type || !['inbound', 'outbound'].includes(type)) {
    return NextResponse.json({ error: 'type must be "inbound" or "outbound"' }, { status: 400 });
  }

  try {
    const call = await prisma.call.create({
      data: {
        leadId: params.id,
        loggedById: guard.user.userId || guard.user.id,
        type,
        clientType: clientType === 'existing' ? 'existing' : 'new',
        duration: duration ? parseInt(duration) : null,
        notes: notes || null,
        outcome: outcome || null,
        calledAt: calledAt ? new Date(calledAt) : new Date(),
      },
      include: { loggedBy: { select: { id: true, name: true } } },
    });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: params.id,
        actorId: guard.user.userId || guard.user.id,
        actorName: guard.user.name,
        type: 'call_logged',
        description: `${type === 'inbound' ? 'Inbound' : 'Outbound'} call logged${outcome ? ` — ${outcome}` : ''}`,
      },
    });

    // Touch the lead's updatedAt
    await prisma.lead.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

    return NextResponse.json({ call }, { status: 201 });
  } catch (error) {
    console.error('POST /api/leads/[id]/calls error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
