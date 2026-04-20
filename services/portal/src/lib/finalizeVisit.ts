// ============================================================
// finalizeVisit.ts — shared transaction used by both the
// live-visits end-visit flow (VisitGroup) and the project-
// meeting completion flow (ProjectMeeting).
//
// What it does, in one transaction:
//   1. Promote any "new lead candidates" into real Lead rows,
//      attached to the same business (ManagedClient or LocalBusiness).
//   2. Resolve the main contact's leadId (creating a Lead if the
//      starred row was a Contact or free-text entry).
//   3. Build the union of leadIds that should end up attached to
//      the project (present + newly-promoted).
//   4. Resolve the project:
//        - existing  → sync its assignments via LeadProjectAssignment
//        - new       → create a LeadProject (primary leadId = main
//                      contact) and create assignments for all leadIds.
//   5. Leave the caller to close out the VisitGroup/ProjectMeeting —
//      this helper stays focused on people + project plumbing.
//
// Added 2026-04-20.
// ============================================================

import prisma from '@/lib/prisma';

export type FinalizeInputPerson =
  | { kind: 'existingLead'; leadId: string }
  | {
      kind: 'newLead';
      tempId: string; // caller-assigned key used to resolve main contact if mainContact.kind==='new'
      name: string;
      email?: string | null;
      phone?: string | null;
      company?: string | null;
      // If the person came from a Contact row, we carry it so we can
      // later mark that Contact as having been seeded into the CRM.
      fromContactId?: string | null;
    };

export type FinalizeInput = {
  // Business scope — at most one populated. Used to link newly-created Leads.
  managedClientId?: string | null;
  localBusinessId?: string | null;

  // Rows the operator checked to attach as co-leads of the project.
  people: FinalizeInputPerson[];

  // Which row is the main contact (star). Required.
  mainContact:
    | { kind: 'existingLead'; leadId: string }
    | { kind: 'newLead'; tempId: string };

  // Project to attach to.
  project:
    | { kind: 'existing'; projectId: string }
    | { kind: 'new'; name: string; stage?: string; objective?: string | null; notes?: string | null };

  // For LeadActivity logging.
  actor: { id: string | null; name: string };
};

export type FinalizeResult = {
  projectId: string;
  mainContactLeadId: string;
  attachedLeadIds: string[];
  createdLeadIds: string[];
};

/**
 * Runs the full finalize transaction. Caller is responsible for
 * updating VisitGroup / ProjectMeeting status after this returns.
 */
export async function runFinalize(input: FinalizeInput): Promise<FinalizeResult> {
  return prisma.$transaction(async (tx) => {
    // ── 1. Promote new leads ─────────────────────────────────
    const tempIdToLeadId = new Map<string, string>();
    const createdLeadIds: string[] = [];

    for (const p of input.people) {
      if (p.kind !== 'newLead') continue;
      const created = await tx.lead.create({
        data: {
          name: (p.name || '').trim() || 'Unknown',
          email: p.email?.trim() || null,
          phone: p.phone?.trim() || null,
          company: p.company?.trim() || null,
          managedClientId: input.managedClientId || null,
          localBusinessId: input.localBusinessId || null,
          stage: 'new',
          source: 'walk_in',
        },
        select: { id: true, name: true },
      });
      tempIdToLeadId.set(p.tempId, created.id);
      createdLeadIds.push(created.id);
    }

    // ── 2. Resolve main contact ──────────────────────────────
    let mainContactLeadId: string;
    if (input.mainContact.kind === 'existingLead') {
      mainContactLeadId = input.mainContact.leadId;
    } else {
      const resolved = tempIdToLeadId.get(input.mainContact.tempId);
      if (!resolved) {
        throw new Error('main contact tempId did not match any newLead in people[]');
      }
      mainContactLeadId = resolved;
    }

    // ── 3. Build final leadIds for the project ──────────────
    const attachedLeadIds = Array.from(
      new Set(
        input.people.map((p) =>
          p.kind === 'existingLead' ? p.leadId : tempIdToLeadId.get(p.tempId)!,
        ),
      ),
    ).filter(Boolean);

    // Main contact must be in the set.
    if (!attachedLeadIds.includes(mainContactLeadId)) {
      attachedLeadIds.unshift(mainContactLeadId);
    }

    // ── 4. Resolve project (existing or create new) ─────────
    let projectId: string;
    if (input.project.kind === 'existing') {
      projectId = input.project.projectId;
      // Sync assignments: delete rows not in set, upsert the rest.
      await tx.leadProjectAssignment.deleteMany({
        where: { projectId, leadId: { notIn: attachedLeadIds } },
      });
      for (const leadId of attachedLeadIds) {
        await tx.leadProjectAssignment.upsert({
          where: { projectId_leadId: { projectId, leadId } },
          create: { projectId, leadId },
          update: {},
        });
      }
      // Promote primary leadId to main contact if it's not already
      const proj = await tx.leadProject.findUnique({ where: { id: projectId }, select: { leadId: true } });
      if (proj && proj.leadId !== mainContactLeadId) {
        await tx.leadProject.update({
          where: { id: projectId },
          data: { leadId: mainContactLeadId },
        });
      }
    } else {
      // Note: LeadProject has `status` (active/won/lost/on_hold), not `stage`.
      // The modal's "Stage" dropdown sends Lead-pipeline values (new/qualified/…)
      // which don't fit LeadProject.status — we just let status default to 'active'
      // and optionally promote the main contact Lead's stage instead.
      const created = await tx.leadProject.create({
        data: {
          name: input.project.name.trim() || 'Untitled project',
          status: 'active',
          objective: input.project.objective?.trim() || null,
          notes: input.project.notes?.trim() || null,
          leadId: mainContactLeadId,
          assignments: {
            create: attachedLeadIds.map((leadId) => ({ leadId })),
          },
        },
        select: { id: true, name: true },
      });

      // If the modal sent a Lead-pipeline stage, promote the main contact's
      // Lead.stage so the pipeline reflects where this new project sits.
      if (input.project.stage && input.project.stage !== 'new') {
        await tx.lead.update({
          where: { id: mainContactLeadId },
          data: { stage: input.project.stage },
        });
      }
      projectId = created.id;
    }

    // ── 5. Activity log on the main contact lead ────────────
    try {
      await tx.leadActivity.create({
        data: {
          leadId: mainContactLeadId,
          actorId: input.actor.id || '',
          actorName: input.actor.name,
          type: input.project.kind === 'new' ? 'project_created' : 'meeting_finalized',
          description:
            input.project.kind === 'new'
              ? `Project "${input.project.name}" created from visit finalize`
              : `Visit finalized and attached to project`,
        },
      });
    } catch {
      // activity log failures should not kill the flow
    }

    return { projectId, mainContactLeadId, attachedLeadIds, createdLeadIds };
  });
}
