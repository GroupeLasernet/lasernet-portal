// ============================================================
// /api/finalize-context — GET (admin)
//
// Single payload the EndVisitModal needs. Accepts one of:
//   ?visitGroupId=...
//   ?meetingId=...
// and returns:
//   - present[]         — attendees detected at this visit/meeting
//   - absent[]          — other main contacts + other leads of the
//                          same business, excluding anyone present
//   - activeProjects[]  — projects of the business (not won/lost),
//                          matching the Projects-tab filter
//   - business          — {kind, id, name} or null (unassigned visit)
//
// Shape is business-scope-agnostic — caller doesn't care whether
// the business is a ManagedClient or a LocalBusiness.
//
// Added 2026-04-20.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

type PersonRow = {
  key: string;           // stable unique key for UI (leadId or contactId)
  leadId: string | null; // null when row is a Contact not yet a Lead
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  photo: string | null;
  role: string | null;
};

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const url = new URL(request.url);
  const visitGroupId = url.searchParams.get('visitGroupId');
  const meetingId = url.searchParams.get('meetingId');

  if (!visitGroupId && !meetingId) {
    return NextResponse.json({ error: 'visitGroupId or meetingId is required' }, { status: 400 });
  }

  // ── Resolve scope (business + present leadIds) ────────────
  let managedClientId: string | null = null;
  let localBusinessId: string | null = null;
  let businessName: string | null = null;
  let presentLeadIds: string[] = [];
  let presentRows: PersonRow[] = [];
  let sourceLabel = '';

  if (visitGroupId) {
    const vg = await prisma.visitGroup.findUnique({
      where: { id: visitGroupId },
      include: {
        managedClient: { select: { id: true, companyName: true, displayName: true } },
        localBusiness: { select: { id: true, name: true } },
        visits: {
          include: {
            lead: {
              select: {
                id: true, name: true, email: true, phone: true, company: true, photo: true,
              },
            },
          },
        },
      },
    });
    if (!vg) return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });
    managedClientId = vg.managedClientId;
    localBusinessId = vg.localBusinessId;
    businessName = vg.managedClient?.companyName || vg.managedClient?.displayName || vg.localBusiness?.name || vg.displayName || null;
    sourceLabel = `Visit · ${businessName || 'Unassigned'}`;
    presentRows = vg.visits.map((v) => ({
      key: v.lead.id,
      leadId: v.lead.id,
      contactId: null,
      name: v.lead.name,
      email: v.lead.email,
      phone: v.lead.phone,
      company: v.lead.company,
      photo: v.lead.photo,
      role: null,
    }));
    presentLeadIds = presentRows.map((r) => r.leadId!).filter(Boolean);
  }

  if (meetingId) {
    const mtg = await prisma.projectMeeting.findUnique({
      where: { id: meetingId },
      include: {
        attendees: {
          include: {
            lead: {
              select: { id: true, name: true, email: true, phone: true, company: true, photo: true },
            },
          },
        },
        project: {
          select: {
            id: true, name: true,
            lead: {
              select: {
                managedClientId: true, localBusinessId: true,
                managedClient: { select: { id: true, companyName: true, displayName: true } },
                localBusiness: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!mtg) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    managedClientId = mtg.project?.lead?.managedClientId ?? null;
    localBusinessId = mtg.project?.lead?.localBusinessId ?? null;
    businessName =
      mtg.project?.lead?.managedClient?.companyName ||
      mtg.project?.lead?.managedClient?.displayName ||
      mtg.project?.lead?.localBusiness?.name ||
      null;
    sourceLabel = `Meeting · ${mtg.project?.name || 'Untitled'}`;
    presentRows = mtg.attendees.map((a) => ({
      key: a.leadId || `att-${a.id}`,
      leadId: a.leadId,
      contactId: null,
      name: a.lead?.name || a.name || 'Unknown',
      email: a.lead?.email || a.email || null,
      phone: a.lead?.phone || null,
      company: a.lead?.company || null,
      photo: a.lead?.photo || null,
      role: null,
    }));
    presentLeadIds = presentRows.map((r) => r.leadId).filter(Boolean) as string[];
  }

  // ── Build absent list (other main contacts + other leads) ─
  const presentKeys = new Set(presentRows.map((r) => r.key));
  const absentMap = new Map<string, PersonRow>();

  if (managedClientId) {
    // (a) Main-contact Contact rows on the ManagedClient
    const contacts = await prisma.contact.findMany({
      where: { managedClientId, archivedAt: null, type: 'maincontact' },
      select: { id: true, name: true, email: true, phone: true, role: true, photo: true },
    });
    for (const c of contacts) {
      // If a Lead already exists with this email, merge under the lead key so we don't double-list.
      const existingLead = c.email
        ? await prisma.lead.findFirst({
            where: { email: c.email, managedClientId },
            select: { id: true, name: true, email: true, phone: true, company: true, photo: true },
          })
        : null;
      if (existingLead) {
        if (presentKeys.has(existingLead.id)) continue;
        absentMap.set(existingLead.id, {
          key: existingLead.id,
          leadId: existingLead.id,
          contactId: c.id,
          name: existingLead.name,
          email: existingLead.email,
          phone: existingLead.phone,
          company: existingLead.company,
          photo: existingLead.photo,
          role: c.role,
        });
      } else {
        const key = `c-${c.id}`;
        if (presentKeys.has(key)) continue;
        absentMap.set(key, {
          key,
          leadId: null,
          contactId: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: null,
          photo: c.photo,
          role: c.role,
        });
      }
    }

    // (b) Other Lead rows linked to the same ManagedClient
    const leads = await prisma.lead.findMany({
      where: { managedClientId, id: { notIn: presentLeadIds.length ? presentLeadIds : [''] } },
      select: { id: true, name: true, email: true, phone: true, company: true, photo: true },
    });
    for (const l of leads) {
      if (absentMap.has(l.id)) continue;
      absentMap.set(l.id, {
        key: l.id,
        leadId: l.id,
        contactId: null,
        name: l.name,
        email: l.email,
        phone: l.phone,
        company: l.company,
        photo: l.photo,
        role: null,
      });
    }
  } else if (localBusinessId) {
    const leads = await prisma.lead.findMany({
      where: { localBusinessId, id: { notIn: presentLeadIds.length ? presentLeadIds : [''] } },
      select: { id: true, name: true, email: true, phone: true, company: true, photo: true },
    });
    for (const l of leads) {
      absentMap.set(l.id, {
        key: l.id,
        leadId: l.id,
        contactId: null,
        name: l.name,
        email: l.email,
        phone: l.phone,
        company: l.company,
        photo: l.photo,
        role: null,
      });
    }
  }

  // ── Active projects of the business ──────────────────────
  // Same filter as the Projects tab: exclude won/lost.
  let activeProjects: { id: string; name: string; stage: string; leadNames: string[] }[] = [];
  if (managedClientId || localBusinessId) {
    const leadIdsOfBiz = await prisma.lead.findMany({
      where: managedClientId ? { managedClientId } : { localBusinessId },
      select: { id: true },
    });
    const leadIdList = leadIdsOfBiz.map((l) => l.id);
    if (leadIdList.length) {
      const projects = await prisma.leadProject.findMany({
        where: {
          stage: { notIn: ['won', 'lost'] },
          OR: [
            { leadId: { in: leadIdList } },
            { assignments: { some: { leadId: { in: leadIdList } } } },
          ],
        },
        select: {
          id: true, name: true, stage: true,
          lead: { select: { name: true } },
          assignments: { select: { lead: { select: { name: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      activeProjects = projects.map((p) => {
        const names = new Set<string>();
        if (p.lead?.name) names.add(p.lead.name);
        for (const a of p.assignments) if (a.lead?.name) names.add(a.lead.name);
        return { id: p.id, name: p.name, stage: p.stage, leadNames: Array.from(names) };
      });
    }
  }

  return NextResponse.json({
    source: { visitGroupId, meetingId, label: sourceLabel },
    business: managedClientId
      ? { kind: 'managedClient', id: managedClientId, name: businessName }
      : localBusinessId
        ? { kind: 'localBusiness', id: localBusinessId, name: businessName }
        : null,
    present: presentRows,
    absent: Array.from(absentMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    activeProjects,
  });
}
