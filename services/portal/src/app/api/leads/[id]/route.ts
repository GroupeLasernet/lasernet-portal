// ============================================================
// /api/leads/[id] — GET, PATCH, DELETE
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
    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        managedClient: { select: { id: true, displayName: true, companyName: true } },
        calls: {
          include: { loggedBy: { select: { id: true, name: true } } },
          orderBy: { calledAt: 'desc' },
        },
        visits: {
          include: { receivedBy: { select: { id: true, name: true } } },
          orderBy: { visitedAt: 'desc' },
        },
        messages: {
          include: { sender: { select: { id: true, name: true } } },
          orderBy: { sentAt: 'asc' },
        },
        activities: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error('GET /api/leads/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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

  const {
    name, email, phone, phone2, company, otherContacts,
    stage, assignedToId, managedClientId, notes,
    estimatedValue, nextFollowUpAt, lostReason,
    callbackReason, objective, budget, productsOfInterest,
  } = body;

  try {
    // Get current lead for activity logging
    const current = await prisma.lead.findUnique({ where: { id: params.id } });
    if (!current) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email || null;
    if (phone !== undefined) data.phone = phone || null;
    if (phone2 !== undefined) data.phone2 = phone2 || null;
    if (company !== undefined) data.company = company || null;
    if (otherContacts !== undefined) data.otherContacts = otherContacts || null;
    if (stage !== undefined) data.stage = stage;
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (managedClientId !== undefined) data.managedClientId = managedClientId || null;
    if (notes !== undefined) data.notes = notes || null;
    if (estimatedValue !== undefined) data.estimatedValue = estimatedValue ? parseFloat(estimatedValue) : null;
    if (nextFollowUpAt !== undefined) data.nextFollowUpAt = nextFollowUpAt ? new Date(nextFollowUpAt) : null;
    if (lostReason !== undefined) data.lostReason = lostReason || null;
    if (callbackReason !== undefined) data.callbackReason = callbackReason || null;
    if (objective !== undefined) data.objective = objective || null;
    if (budget !== undefined) data.budget = budget !== null && budget !== '' ? parseFloat(budget) : null;
    if (productsOfInterest !== undefined) data.productsOfInterest = productsOfInterest || null;

    // Handle won/lost timestamps
    if (stage === 'won' && !current.wonAt) data.wonAt = new Date();
    if (stage === 'lost' && !current.lostAt) data.lostAt = new Date();

    const lead = await prisma.lead.update({
      where: { id: params.id },
      data,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        managedClient: { select: { id: true, displayName: true, companyName: true } },
      },
    });

    // Log stage change activity
    if (stage && stage !== current.stage) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          actorId: guard.user.userId || guard.user.id,
          actorName: guard.user.name,
          type: 'stage_change',
          description: `Stage changed from ${current.stage} to ${stage}`,
          fromStage: current.stage,
          toStage: stage,
        },
      });
    }

    // Log assignment change
    if (assignedToId !== undefined && assignedToId !== current.assignedToId) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          actorId: guard.user.userId || guard.user.id,
          actorName: guard.user.name,
          type: 'assignment_change',
          description: assignedToId
            ? `Lead assigned to ${lead.assignedTo?.name || 'someone'}`
            : 'Lead unassigned',
        },
      });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error('PATCH /api/leads/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    await prisma.lead.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/leads/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
