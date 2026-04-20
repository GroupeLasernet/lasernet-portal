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
//   • Leads (prospects, may have company) Lead      → ben@abc or ben@lead
//
// Handles are COMPUTED at read time via lib/handles.ts — the
// person's name drives the handle, so renaming stays in sync
// without a migration.
// ============================================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { prismaHandle, clientHandle, leadHandle } from '@/lib/handles';

export interface PeopleRecord {
  id: string;
  source: 'user' | 'contact' | 'lead';
  staffType: 'prisma' | 'client' | 'lead';
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
      people.push({
        id: l.id,
        source: 'lead',
        staffType: 'lead',
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

    // Sort: Prisma staff first, then client staff alphabetically by company,
    // then leads by most-recent first.
    people.sort((a, b) => {
      const order = { prisma: 0, client: 1, lead: 2 } as const;
      const diff = order[a.staffType] - order[b.staffType];
      if (diff !== 0) return diff;
      if (a.staffType === 'lead' || b.staffType === 'lead') {
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
