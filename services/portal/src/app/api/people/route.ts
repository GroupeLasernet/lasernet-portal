// ============================================================
// GET /api/people
// ------------------------------------------------------------
// Aggregates every human-shaped record in the system into ONE
// unified list so the People tab can show them side-by-side:
//
//   • Prisma Staff (role = admin)         User      → @hugob
//   • Prisma Clients (role = client)      User      → @firstnamelastinitial
//   • Client Staff — main contacts        Contact   → ben@abc
//   • Client Staff — staff                Contact   → mariet@abc
//   • Unassigned (pre-business, pre-demo) Lead      → ben@lead
//   • Leads (real prospects)              Lead      → ben@abc or ben@lead
//
// Unassigned vs Lead rule (set by Hugo 2026-04-19):
//   A Lead row is UNASSIGNED iff managedClientId IS NULL AND
//   localBusinessId IS NULL AND stage ∈ {new, qualified, demo_scheduled}.
//   Otherwise it's a real LEAD. The rationale: "cannot become a lead
//   until they finish a meeting" + no business link yet.
//
// Handles are COMPUTED at read time via lib/handles.ts — the
// person's name drives the handle, so renaming stays in sync
// without a migration.
// ============================================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { prismaHandle, clientHandle, leadHandle } from '@/lib/handles';

export type StaffType = 'prisma' | 'client' | 'unassigned' | 'lead';

export interface PeopleRecord {
  id: string;
  source: 'user' | 'contact' | 'lead';
  staffType: StaffType;
  kind: string; // finer label: "admin" | "client" | "maincontact" | "staff" | lead stage
  name: string;
  handle: string;
  email: string | null;
  phone: string | null;
  photo: string | null;
  company: string | null;
  role: string | null;
  clientId: string | null;   // ManagedClient.id — null if standalone
  clientName: string | null; // ManagedClient displayName — null if standalone
  status: string | null;     // user status or lead stage
  createdAt: string;
}

// Stages that count as "before a meeting finished"
const PRE_MEETING_STAGES = new Set(['new', 'qualified', 'demo_scheduled']);

export async function GET() {
  try {
    const [users, contacts, leads] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true, name: true, email: true, phone: true, photo: true,
          company: true, role: true, subrole: true, status: true, createdAt: true,
        },
      }),
      prisma.contact.findMany({
        select: {
          id: true, name: true, email: true, phone: true, photo: true,
          role: true, type: true, createdAt: true,
          managedClientId: true,
          managedClient: { select: { id: true, displayName: true, companyName: true } },
        },
      }),
      prisma.lead.findMany({
        select: {
          id: true, name: true, email: true, phone: true, photo: true,
          company: true, stage: true, createdAt: true,
          managedClientId: true,
          localBusinessId: true,
          managedClient: { select: { id: true, displayName: true, companyName: true } },
        },
      }),
    ]);

    const people: PeopleRecord[] = [];

    for (const u of users) {
      const isPrismaStaff = u.role === 'admin';
      people.push({
        id: u.id,
        source: 'user',
        staffType: isPrismaStaff ? 'prisma' : 'client',
        kind: u.subrole || u.role || 'user',
        name: u.name,
        handle: isPrismaStaff ? prismaHandle(u.name) : clientHandle(u.name, u.company),
        email: u.email || null,
        phone: u.phone || null,
        photo: u.photo || null,
        company: u.company || null,
        role: u.subrole || u.role || null,
        clientId: null,
        clientName: null,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
      });
    }

    for (const c of contacts) {
      const companyLabel = c.managedClient?.companyName || c.managedClient?.displayName || null;
      people.push({
        id: c.id,
        source: 'contact',
        staffType: 'client',
        kind: c.type, // "maincontact" | "staff"
        name: c.name,
        handle: clientHandle(c.name, companyLabel),
        email: c.email || null,
        phone: c.phone || null,
        photo: c.photo || null,
        company: companyLabel,
        role: c.role || null,
        clientId: c.managedClient?.id || null,
        clientName: c.managedClient?.displayName || null,
        status: null,
        createdAt: c.createdAt.toISOString(),
      });
    }

    for (const l of leads) {
      const companyLabel = l.managedClient?.companyName || l.managedClient?.displayName || l.company || null;

      // Unassigned rule — see header comment for the full rationale.
      const hasBusinessLink = !!l.managedClientId || !!l.localBusinessId;
      const isUnassigned = !hasBusinessLink && PRE_MEETING_STAGES.has(l.stage);

      people.push({
        id: l.id,
        source: 'lead',
        staffType: isUnassigned ? 'unassigned' : 'lead',
        kind: l.stage,
        name: l.name,
        handle: leadHandle(l.name, companyLabel),
        email: l.email || null,
        phone: l.phone || null,
        photo: l.photo || null,
        company: companyLabel,
        role: null,
        clientId: l.managedClient?.id || null,
        clientName: l.managedClient?.displayName || null,
        status: l.stage,
        createdAt: l.createdAt.toISOString(),
      });
    }

    // Sort: Prisma staff first, then client staff (alpha by name),
    // then Unassigned (newest first), then Leads (newest first).
    people.sort((a, b) => {
      const order: Record<StaffType, number> = { prisma: 0, client: 1, unassigned: 2, lead: 3 };
      const diff = order[a.staffType] - order[b.staffType];
      if (diff !== 0) return diff;
      if (a.staffType === 'lead' || a.staffType === 'unassigned') {
        return b.createdAt.localeCompare(a.createdAt); // newest first
      }
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ people });
  } catch (err: any) {
    console.error('GET /api/people failed', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
