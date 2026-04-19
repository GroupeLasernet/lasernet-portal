import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/projects — Fetch all projects with lead + client info
export async function GET() {
  try {
    const projects = await prisma.leadProject.findMany({
      include: {
        lead: {
          include: {
            managedClient: {
              include: {
                contacts: true,
              },
            },
          },
        },
        quotes: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = projects.map((p) => {
      const mc = p.lead.managedClient;
      const activeMainContacts = mc
        ? mc.contacts.filter(
            (c) =>
              (c.type === 'maincontact' || c.type === 'responsible') &&
              !c.archivedAt
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
        lead: {
          id: p.lead.id,
          name: p.lead.name,
          email: p.lead.email,
          company: p.lead.company,
          stage: p.lead.stage,
        },
        business: mc
          ? {
              id: mc.id,
              displayName: mc.displayName,
              companyName: mc.companyName,
            }
          : null,
        mainContacts: activeMainContacts.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
        })),
        isOrphaned: mc !== null && activeMainContacts.length === 0,
      };
    });

    return NextResponse.json({ projects: result });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
