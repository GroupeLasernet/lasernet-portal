// ============================================================
// /api/kiosk/register — POST (public, no auth)
// Walk-in registration from the iPad kiosk.
// Creates or finds a Lead, then creates a Visit record.
// Optionally links to a business (ManagedClient or LocalBusiness)
// and manages VisitGroup membership.
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

  const { name, email, phone, company, photo, purpose, companyId, companyType, visitGroupId } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    // Build business link fields
    const businessLink: { managedClientId?: string; localBusinessId?: string } = {};
    if (companyId && companyType === 'managed') {
      businessLink.managedClientId = companyId;
    } else if (companyId && companyType === 'local') {
      businessLink.localBusinessId = companyId;
    }

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
          ...businessLink,
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
    } else if (businessLink.managedClientId || businessLink.localBusinessId) {
      // Update existing lead with business link if not already set
      if (!lead.managedClientId && !lead.localBusinessId) {
        lead = await prisma.lead.update({
          where: { id: lead.id },
          data: businessLink,
        });
      }
    }

    // Resolve visit group
    let resolvedGroupId: string | null = visitGroupId || null;

    if (!resolvedGroupId && (businessLink.managedClientId || businessLink.localBusinessId)) {
      // Try to find an active VisitGroup for this business from today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const existingGroup = await prisma.visitGroup.findFirst({
        where: {
          status: 'active',
          createdAt: { gte: todayStart },
          ...(businessLink.managedClientId
            ? { managedClientId: businessLink.managedClientId }
            : { localBusinessId: businessLink.localBusinessId }),
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingGroup) {
        resolvedGroupId = existingGroup.id;
      } else {
        // Create a new VisitGroup for this business
        const newGroup = await prisma.visitGroup.create({
          data: {
            ...(businessLink.managedClientId
              ? { managedClientId: businessLink.managedClientId }
              : { localBusinessId: businessLink.localBusinessId }),
            mainContactId: lead.id,
            status: 'active',
          },
        });
        resolvedGroupId = newGroup.id;
      }
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
        ...(resolvedGroupId ? { visitGroupId: resolvedGroupId } : {}),
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

    return NextResponse.json(
      {
        success: true,
        leadId: lead.id,
        visitId: visit.id,
        ...(resolvedGroupId ? { visitGroupId: resolvedGroupId } : {}),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('POST /api/kiosk/register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
