// ============================================================
// /api/visit-groups/[id]/complete — POST (admin)
// Close out a visit: mark completed, generate summary,
// optionally send summary email to main contact.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await params;

  try {
    // Fetch the full visit group
    const group = await prisma.visitGroup.findUnique({
      where: { id },
      include: {
        visits: {
          include: {
            lead: { select: { id: true, name: true, email: true, company: true, photo: true } },
          },
        },
        managedClient: { select: { id: true, displayName: true, companyName: true, email: true, address: true, city: true, province: true } },
        localBusiness: { select: { id: true, name: true, email: true, address: true, city: true, province: true } },
        needs: true,
        files: { select: { id: true, fileName: true, fileType: true, createdAt: true } },
      },
    });

    if (!group) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });
    }

    // Find the main contact
    let mainContactEmail: string | null = null;
    let mainContactName: string | null = null;
    if (group.mainContactId) {
      const mainVisit = group.visits.find(v => v.lead.id === group.mainContactId);
      if (mainVisit) {
        mainContactEmail = mainVisit.lead.email;
        mainContactName = mainVisit.lead.name;
      }
    }

    // Build visit summary
    const businessName = group.managedClient?.companyName || group.managedClient?.displayName || group.localBusiness?.name || null;
    const visitors = group.visits.map(v => ({
      name: v.lead.name,
      email: v.lead.email,
      company: v.lead.company,
      isMainContact: v.lead.id === group.mainContactId,
    }));
    const needs = group.needs.map(n => ({
      type: n.type,
      description: n.description,
      status: n.status,
      expectedDate: n.expectedDate,
    }));
    const filesCount = group.files.length;

    const summary = {
      businessName,
      visitDate: group.createdAt,
      completedAt: new Date().toISOString(),
      visitors,
      mainContact: mainContactName ? { name: mainContactName, email: mainContactEmail } : null,
      needs,
      filesCount,
      notes: group.notes,
      expectedFollowUpAt: group.expectedFollowUpAt,
    };

    // Mark as completed
    const updated = await prisma.visitGroup.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    // TODO: Send summary email to main contact when email service is configured
    // For now, return the summary so the UI can display it
    // When email is set up: send to mainContactEmail with formatted summary

    return NextResponse.json({
      success: true,
      summary,
      group: updated,
      mainContactEmail,
    });
  } catch (error) {
    console.error('POST /api/visit-groups/[id]/complete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
