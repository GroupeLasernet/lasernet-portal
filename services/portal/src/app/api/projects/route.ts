import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// ============================================================
// GET /api/projects
// ------------------------------------------------------------
// Returns every project with its FULL lead set (the primary lead
// + any additional co-leads from LeadProjectAssignment). The
// Projects tab groups by unique lead-set: a solo project appears
// in that lead's own bloc, a shared project appears once in a
// combined bloc listing all its leads.
//
// Orphaned rule (Hugo, 2026-04-20):
//   A project is orphaned iff EVERY lead attached to it has a
//   business but zero active main contacts. If at least one lead
//   has no business (standalone prospect) OR has a business with
//   an active main contact, the project resolves cleanly.
// ============================================================

export async function GET() {
  try {
    const projects = await prisma.leadProject.findMany({
      include: {
        // Primary lead — still kept on the model for backward compat.
        lead: {
          include: {
            managedClient: { include: { contacts: true } },
          },
        },
        // All co-leads via the join table (includes the primary too after
        // migration backfill). `orderBy createdAt asc` keeps the group
        // key stable so co-led blocs render consistently.
        assignments: {
          orderBy: { createdAt: 'asc' },
          include: {
            lead: {
              include: {
                managedClient: { include: { contacts: true } },
              },
            },
          },
        },
        quotes: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const leadIsOrphaned = (lead: typeof projects[number]['lead']) => {
      const mc = lead?.managedClient;
      if (!mc) return false; // standalone prospect = not orphaned
      const activeMain = mc.contacts.filter(
        (c) => (c.type === 'maincontact' || c.type === 'responsible') && !c.archivedAt
      );
      return activeMain.length === 0;
    };

    const result = projects.map((p) => {
      // Build the full lead list, de-duped. Start with the primary to
      // guarantee it's there even if somehow no assignment exists yet.
      const seen = new Set<string>();
      const leads: typeof projects[number]['lead'][] = [];
      if (p.lead && !seen.has(p.lead.id)) { leads.push(p.lead); seen.add(p.lead.id); }
      for (const a of p.assignments) {
        if (a.lead && !seen.has(a.lead.id)) { leads.push(a.lead); seen.add(a.lead.id); }
      }

      // Orphaned iff every lead is orphaned. Empty list shouldn't
      // happen (primary is required) but guard anyway.
      const isOrphaned = leads.length > 0 && leads.every(leadIsOrphaned);

      // For the project card, show the FIRST lead's business as the
      // representative business. Shared projects often have the same
      // business on both leads anyway.
      const primaryMc = leads[0]?.managedClient || null;
      const primaryMainContacts = primaryMc
        ? primaryMc.contacts.filter(
            (c) => (c.type === 'maincontact' || c.type === 'responsible') && !c.archivedAt
          )
        : [];

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        notes: p.notes,
        callbackReason: p.callbackReason,
        objective: p.objective,
        budget: p.budget,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        quotesCount: p.quotes.length,
        leads: leads.map((l) => ({
          id: l.id,
          name: l.name,
          email: l.email,
          company: l.company,
          stage: l.stage,
          businessId: l.managedClient?.id || null,
          businessName: l.managedClient?.displayName || l.managedClient?.companyName || null,
        })),
        // Keep `lead` (singular) for any legacy callers still reading it.
        lead: {
          id: p.lead.id,
          name: p.lead.name,
          email: p.lead.email,
          company: p.lead.company,
          stage: p.lead.stage,
        },
        business: primaryMc
          ? {
              id: primaryMc.id,
              displayName: primaryMc.displayName,
              companyName: primaryMc.companyName,
            }
          : null,
        mainContacts: primaryMainContacts.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
        })),
        isOrphaned,
      };
    });

    return NextResponse.json({ projects: result });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
