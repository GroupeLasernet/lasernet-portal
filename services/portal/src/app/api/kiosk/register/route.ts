// ============================================================
// /api/kiosk/register — POST (public, no auth)
// Walk-in registration from the iPad kiosk.
// Creates or finds a Lead, then creates a Visit record.
// Auto-groups visitors into VisitGroups by:
//   1. Explicit companyId (ManagedClient or LocalBusiness)
//   2. Company name match (same company typed today)
//   3. Email domain match (same @domain today)
//   4. Individual group (solo visitor)
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

  const { name, email, phone, company, photo, purpose, companyId, companyType, visitGroupId, receivedById } = body;

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

    // Auto-create LocalBusiness when company name is provided but no business link exists
    if (!businessLink.managedClientId && !businessLink.localBusinessId && company?.trim()) {
      const companyTrimmed = company.trim();
      // Check ManagedClient by companyName or displayName
      const existingMC = await prisma.managedClient.findFirst({
        where: {
          OR: [
            { companyName: { equals: companyTrimmed, mode: 'insensitive' } },
            { displayName: { equals: companyTrimmed, mode: 'insensitive' } },
          ],
        },
      });
      if (existingMC) {
        businessLink.managedClientId = existingMC.id;
      } else {
        // Check LocalBusiness by name
        const existingLB = await prisma.localBusiness.findFirst({
          where: { name: { equals: companyTrimmed, mode: 'insensitive' } },
        });
        if (existingLB) {
          businessLink.localBusinessId = existingLB.id;
        } else {
          // No match — auto-create a LocalBusiness
          const newLB = await prisma.localBusiness.create({
            data: { name: companyTrimmed },
          });
          businessLink.localBusinessId = newLB.id;
        }
      }
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

      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          actorName: name.trim(),
          type: 'stage_change',
          description: 'Walk-in registration at kiosk',
          toStage: 'new',
        },
      });
    } else if (businessLink.managedClientId || businessLink.localBusinessId) {
      if (!lead.managedClientId && !lead.localBusinessId) {
        lead = await prisma.lead.update({
          where: { id: lead.id },
          data: businessLink,
        });
      }
    }

    // Dedup check: if this lead already has an ACTIVE visit today, skip
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existingVisitToday = await prisma.visit.findFirst({
      where: {
        leadId: lead.id,
        visitedAt: { gte: todayStart },
        visitGroup: { status: 'active' },
      },
    });

    if (existingVisitToday) {
      return NextResponse.json(
        {
          success: true,
          leadId: lead.id,
          visitId: existingVisitToday.id,
          visitGroupId: existingVisitToday.visitGroupId,
          alreadyCheckedIn: true,
        },
        { status: 200 },
      );
    }

    // ---- Resolve visit group ----
    // Priority: explicit visitGroupId > explicit business > company name > email domain > new solo group
    let resolvedGroupId: string | null = visitGroupId || null;

    if (!resolvedGroupId) {
      // 1. Try by explicit business link (ManagedClient or LocalBusiness)
      if (businessLink.managedClientId || businessLink.localBusinessId) {
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
        if (existingGroup) resolvedGroupId = existingGroup.id;
      }

      // 2. Try by company name — find an active group with visits from the same company today
      if (!resolvedGroupId && company?.trim()) {
        const companyNormalized = company.trim().toLowerCase();
        const matchingVisit = await prisma.visit.findFirst({
          where: {
            visitedAt: { gte: todayStart },
            visitorCompany: { equals: companyNormalized, mode: 'insensitive' },
            visitGroupId: { not: null },
            visitGroup: { status: 'active' },
          },
          select: { visitGroupId: true },
          orderBy: { visitedAt: 'desc' },
        });
        if (matchingVisit?.visitGroupId) resolvedGroupId = matchingVisit.visitGroupId;
      }

      // 3. Try by email domain — find an active group with visits from the same domain today
      if (!resolvedGroupId && email) {
        const atIndex = email.indexOf('@');
        if (atIndex >= 0) {
          const domain = email.slice(atIndex + 1).trim().toLowerCase();
          // Skip common free email providers
          const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'mail.com'];
          if (domain && !freeProviders.includes(domain)) {
            const matchingVisit = await prisma.visit.findFirst({
              where: {
                visitedAt: { gte: todayStart },
                visitorEmail: { endsWith: `@${domain}`, mode: 'insensitive' },
                visitGroupId: { not: null },
                visitGroup: { status: 'active' },
              },
              select: { visitGroupId: true },
              orderBy: { visitedAt: 'desc' },
            });
            if (matchingVisit?.visitGroupId) resolvedGroupId = matchingVisit.visitGroupId;
          }
        }
      }

      // 4. No match — create a new group for this visitor
      if (!resolvedGroupId) {
        const newGroup = await prisma.visitGroup.create({
          data: {
            ...(businessLink.managedClientId ? { managedClientId: businessLink.managedClientId } : {}),
            ...(businessLink.localBusinessId ? { localBusinessId: businessLink.localBusinessId } : {}),
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
        visitGroupId: resolvedGroupId,
        receivedById: receivedById || null,
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
        visitGroupId: resolvedGroupId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('POST /api/kiosk/register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
