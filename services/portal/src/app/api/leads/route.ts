// ============================================================
// /api/leads — GET (list) and POST (create)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get('stage');
  const source = searchParams.get('source');
  const assignedToId = searchParams.get('assignedToId');
  const search = searchParams.get('search');

  try {
    const where: any = {};
    if (stage) where.stage = stage;
    if (source) where.source = source;
    if (assignedToId) where.assignedToId = assignedToId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        managedClient: { select: { id: true, displayName: true, companyName: true } },
        _count: { select: { calls: true, visits: true, messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error('GET /api/leads error:', error);
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

  const { name, email, phone, company, source, stage, assignedToId, managedClientId, notes, estimatedValue } = body;

  if (!name || !source) {
    return NextResponse.json({ error: 'name and source are required' }, { status: 400 });
  }

  try {
    const lead = await prisma.lead.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        company: company || null,
        source,
        stage: stage || 'new',
        assignedToId: assignedToId || null,
        managedClientId: managedClientId || null,
        notes: notes || null,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        managedClient: { select: { id: true, displayName: true, companyName: true } },
      },
    });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        actorId: guard.user.userId || guard.user.id,
        actorName: guard.user.name,
        type: 'stage_change',
        description: `Lead created from ${source}`,
        toStage: 'new',
      },
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error('POST /api/leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
