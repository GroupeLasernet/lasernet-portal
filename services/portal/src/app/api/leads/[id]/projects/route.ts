import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// ============================================================
// GET /api/leads/[id]/projects
// ------------------------------------------------------------
// Returns every project where this lead is ATTACHED — either as
// the primary (LeadProject.leadId) OR as a co-lead via the
// LeadProjectAssignment join table. A shared project will show
// up for every lead it's assigned to.
// ============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const projects = await prisma.leadProject.findMany({
      where: {
        OR: [
          { leadId: id },
          { assignments: { some: { leadId: id } } },
        ],
      },
      include: {
        quotes: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
        assignments: {
          orderBy: { createdAt: 'asc' },
          include: { lead: { select: { id: true, name: true, email: true, company: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// POST /api/leads/[id]/projects
// ------------------------------------------------------------
// Creates a new project under this lead. The creating lead is
// recorded as the primary (LeadProject.leadId) AND inserted into
// the assignment join table so it shows up as a co-lead too —
// that keeps the "assignments" list the canonical source.
// ============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, notes, callbackReason, suggestedProducts, objective, budget } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const project = await prisma.leadProject.create({
      data: {
        leadId: id,
        name: name.trim(),
        notes: notes || null,
        callbackReason: callbackReason || null,
        suggestedProducts: suggestedProducts || null,
        objective: objective || null,
        budget: budget != null ? parseFloat(budget) : null,
        // Auto-insert the creating lead into the assignment table so
        // the Projects tab grouping finds it under this lead's bloc.
        assignments: {
          create: { leadId: id },
        },
      },
      include: {
        quotes: { include: { items: true } },
        assignments: { include: { lead: true } },
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
