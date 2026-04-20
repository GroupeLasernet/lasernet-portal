// ============================================================
// /api/local-businesses/[id]/match-qb — POST
// Links a local business to a QB customer:
// 1. Creates a ManagedClient from the QB customer data
// 2. Migrates all visitGroups and leads from LocalBusiness → ManagedClient
// 3. Deletes the LocalBusiness
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

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

  const { qbClient } = body;
  if (!qbClient || !qbClient.id) {
    return NextResponse.json({ error: 'qbClient data with id is required' }, { status: 400 });
  }

  try {
    const localBusiness = await prisma.localBusiness.findUnique({
      where: { id: params.id },
      include: { _count: { select: { visitGroups: true, leads: true } } },
    });

    if (!localBusiness) {
      return NextResponse.json({ error: 'Local business not found' }, { status: 404 });
    }

    // Check if this QB customer is already a ManagedClient
    let managedClient = await prisma.managedClient.findUnique({
      where: { qbId: qbClient.id },
    });

    if (!managedClient) {
      // Create the ManagedClient from QB data
      managedClient = await prisma.managedClient.create({
        data: {
          qbId: qbClient.id,
          displayName: qbClient.displayName || localBusiness.name,
          companyName: qbClient.companyName || localBusiness.name,
          email: qbClient.email || localBusiness.email || null,
          phone: qbClient.phone || localBusiness.phone || null,
          address: qbClient.address || localBusiness.address || null,
          city: qbClient.city || localBusiness.city || null,
          province: qbClient.province || localBusiness.province || null,
          postalCode: qbClient.postalCode || localBusiness.postalCode || null,
        },
      });
    } else if (qbClient.displayName || qbClient.companyName) {
      // Existing ManagedClient: refresh the name fields from QB so the
      // "QB name wins" rule holds even when we're re-linking through an
      // already-seen QB customer. Other fields left alone.
      managedClient = await prisma.managedClient.update({
        where: { id: managedClient.id },
        data: {
          displayName: qbClient.displayName || managedClient.displayName,
          companyName: qbClient.companyName || managedClient.companyName,
        },
      });
    }

    // Migrate visitGroups from LocalBusiness → ManagedClient
    await prisma.visitGroup.updateMany({
      where: { localBusinessId: localBusiness.id },
      data: { localBusinessId: null, managedClientId: managedClient.id },
    });

    // Migrate leads from LocalBusiness → ManagedClient
    await prisma.lead.updateMany({
      where: { localBusinessId: localBusiness.id },
      data: { localBusinessId: null, managedClientId: managedClient.id },
    });

    // Delete the LocalBusiness (now empty)
    await prisma.localBusiness.delete({ where: { id: localBusiness.id } });

    return NextResponse.json({
      success: true,
      managedClientId: managedClient.id,
      migratedVisitGroups: localBusiness._count.visitGroups,
      migratedLeads: localBusiness._count.leads,
    });
  } catch (error) {
    console.error('POST /api/local-businesses/[id]/match-qb error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
