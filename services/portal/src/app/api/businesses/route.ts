import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  try {
    // Fetch ManagedClients
    const managedWhere: any = {};
    if (q) {
      managedWhere.OR = [
        { companyName: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ];
    }
    const managedClients = await prisma.managedClient.findMany({
      where: managedWhere,
      include: {
        _count: { select: { visitGroups: true, leads: true, contacts: true } },
      },
      orderBy: { companyName: 'asc' },
    });

    // Fetch LocalBusinesses
    const localWhere: any = {};
    if (q) {
      localWhere.name = { contains: q, mode: 'insensitive' };
    }
    const localBusinesses = await prisma.localBusiness.findMany({
      where: localWhere,
      include: {
        _count: { select: { visitGroups: true, leads: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Fetch orphan Leads — leads with a free-text company but NOT yet
    // linked to either a ManagedClient or a LocalBusiness. These show up
    // in the "Businesses not linked yet" container as virtual rows so
    // Hugo can match them to a QB customer without first manually
    // creating a LocalBusiness shell. Source tag = 'lead'; id prefix = 'lead:'.
    const orphanLeadWhere: any = {
      managedClientId: null,
      localBusinessId: null,
      company: { not: null },
    };
    if (q) {
      orphanLeadWhere.OR = [
        { company: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    const orphanLeads = await prisma.lead.findMany({
      where: orphanLeadWhere,
      select: {
        id: true, name: true, company: true, email: true, phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    // Dedupe by normalised company name — if Hugo has three leads all
    // with company "eco surafce lassser", show one virtual row.
    const orphanByCompany = new Map<string, typeof orphanLeads[number]>();
    for (const l of orphanLeads) {
      const key = (l.company || '').toLowerCase().trim();
      if (!key) continue;
      if (!orphanByCompany.has(key)) orphanByCompany.set(key, l);
    }

    // Merge into unified shape
    const businesses = [
      ...managedClients.map(mc => ({
        id: mc.id,
        name: mc.companyName || mc.displayName,
        displayName: mc.displayName,
        source: 'quickbooks' as const,
        qbId: mc.qbId,
        address: mc.address,
        city: mc.city,
        province: mc.province,
        postalCode: mc.postalCode,
        phone: mc.phone,
        email: mc.email,
        website: null as string | null,
        notes: null as string | null,
        createdAt: mc.addedAt.toISOString(),
        _count: {
          visitGroups: mc._count.visitGroups,
          leads: mc._count.leads,
          contacts: mc._count.contacts,
        },
      })),
      ...localBusinesses.map(lb => ({
        id: lb.id,
        name: lb.name,
        displayName: lb.name,
        source: 'local' as const,
        qbId: null as string | null,
        address: lb.address,
        city: lb.city,
        province: lb.province,
        postalCode: lb.postalCode,
        phone: lb.phone,
        email: lb.email,
        website: lb.website,
        notes: lb.notes,
        createdAt: lb.createdAt.toISOString(),
        _count: {
          visitGroups: lb._count.visitGroups,
          leads: lb._count.leads,
          contacts: 0,
        },
      })),
      // Virtual rows derived from orphan leads (see above for rationale).
      ...Array.from(orphanByCompany.values()).map(l => ({
        id: `lead:${l.id}`,
        name: l.company || l.name,
        displayName: l.company || l.name,
        source: 'lead' as const,
        qbId: null as string | null,
        address: null as string | null,
        city: null as string | null,
        province: null as string | null,
        postalCode: null as string | null,
        phone: l.phone,
        email: l.email,
        website: null as string | null,
        notes: null as string | null,
        createdAt: l.createdAt.toISOString(),
        _count: { visitGroups: 0, leads: 1, contacts: 0 },
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ businesses });
  } catch (error) {
    console.error('GET /api/businesses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
