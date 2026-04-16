// ============================================================
// /api/kiosk/register — POST (public, no auth)
// Walk-in registration from the iPad kiosk.
// Creates or finds a Lead, then creates a Visit record.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, email, phone, company, photo, purpose } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    // Find existing lead by email, or create a new one
    let lead = email
      ? await prisma.lead.findFirst({ where: { email: email.toLowerCase().trim() } })
      : null;

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          name: name.trim(),
          email: email ? email.toLowerCase().trim() : null,
          phone: phone?.trim() || null,
          company: company?.trim() || null,
          photo: photo || null,
          source: 'walk_in',
          stage: 'new',
        },
      });

      // Log creation activity
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          actorName: name.trim(),
          type: 'stage_change',
          description: `Walk-in registration at kiosk`,
          toStage: 'new',
        },
      });
    }

    // Create the visit record
    const visit = await prisma.visit.create({
      data: {
        leadId: lead.id,
        visitorName: name.trim(),
        visitorEmail: email ? email.toLowerCase().trim() : null,
        visitorPhone: phone?.trim() || null,
        visitorCompany: company?.trim() || null,
        visitorPhoto: photo || null,
        purpose: purpose || 'inquiry',
      },
    });

    // Log visit activity
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        actorName: name.trim(),
        type: 'visit_logged',
        description: `Checked in at kiosk${purpose ? ` — ${purpose}` : ''}`,
      },
    });

    return NextResponse.json({ success: true, leadId: lead.id, visitId: visit.id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/kiosk/register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
