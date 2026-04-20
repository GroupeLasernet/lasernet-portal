// ============================================================
// /api/leads/[id]/match-qb — POST
// ------------------------------------------------------------
// Links an ORPHAN lead (company text filled in, but no
// ManagedClient / LocalBusiness link yet) directly to a QB
// customer. The Businesses page surfaces such leads as virtual
// "Businesses not linked yet" rows (id prefix `lead:`) so Hugo
// can match them to a QB customer in one click without first
// materialising a LocalBusiness shell.
//
// Mirrors /api/local-businesses/[id]/match-qb:
// 1. Find-or-create a ManagedClient for the QB customer
// 2. Set lead.managedClientId = managedClient.id
// 3. Clear lead.localBusinessId (defensive)
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
    const lead = await prisma.lead.findUnique({ where: { id: params.id } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Find-or-create the ManagedClient for this QB customer.
    let managedClient = await prisma.managedClient.findUnique({
      where: { qbId: qbClient.id },
    });

    if (!managedClient) {
      managedClient = await prisma.managedClient.create({
        data: {
          qbId: qbClient.id,
          displayName: qbClient.displayName || lead.company || lead.name,
          companyName: qbClient.companyName || lead.company || lead.name,
          email: qbClient.email || lead.email || null,
          phone: qbClient.phone || lead.phone || null,
          address: qbClient.address || null,
          city: qbClient.city || null,
          province: qbClient.province || null,
          postalCode: qbClient.postalCode || null,
        },
      });
    }

    // Link the lead — and ALSO any sibling orphan leads that share the
    // same free-text company name (since the Businesses list dedupes
    // by company and we just linked the representative row).
    const companyKey = (lead.company || '').toLowerCase().trim();
    if (companyKey) {
      await prisma.lead.updateMany({
        where: {
          managedClientId: null,
          localBusinessId: null,
          company: { equals: lead.company, mode: 'insensitive' },
        },
        data: {
          managedClientId: managedClient.id,
          localBusinessId: null,
        },
      });
    } else {
      // Just this one lead — no company text to match siblings by.
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          managedClientId: managedClient.id,
          localBusinessId: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      managedClientId: managedClient.id,
    });
  } catch (error) {
    console.error('POST /api/leads/[id]/match-qb error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
