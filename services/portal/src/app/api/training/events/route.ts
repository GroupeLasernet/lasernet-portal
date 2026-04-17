import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { t as translate, Language } from '@/lib/translations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// GET /api/training/events — list all events, optionally filtered by clientId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const events = await db.trainingEvent.findMany({
      where: clientId ? { managedClientId: clientId } : undefined,
      include: {
        template: { select: { id: true, name: true } },
        attendees: true,
        files: { select: { id: true, name: true, fileType: true, fileSize: true, createdAt: true } },
        managedClient: { select: { id: true, displayName: true, companyName: true } },
      },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json({ events });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/training/events — create an event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, date, templateId, attendees, duration, managedClientId } = body;
    if (!title || !date) return NextResponse.json({ error: 'Title and date are required' }, { status: 400 });

    const event = await db.trainingEvent.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        duration: duration ? parseInt(duration) : null,
        templateId: templateId || null,
        managedClientId: managedClientId || null,
        ...(attendees && attendees.length > 0 && {
          attendees: {
            create: attendees.map((a: { contactId: string; name: string; email: string }) => ({
              contactId: a.contactId,
              name: a.name,
              email: a.email,
            })),
          },
        }),
      },
      include: { attendees: true, template: true, files: true, managedClient: { select: { id: true, displayName: true, companyName: true } } },
    });

    // Auto-create a VisitGroup for the training day so attendees show up
    // on the kiosk's "expected visitors" panel and in live-visits.
    if (attendees && attendees.length > 0) {
      try {
        // Find or create leads for each attendee, then create visits
        const visitGroup = await prisma.visitGroup.create({
          data: {
            displayName: title,
            managedClientId: managedClientId || null,
            trainingEventId: event.id,
            status: 'active',
          },
        });

        for (const a of attendees as { contactId: string; name: string; email: string }[]) {
          // Find existing lead by email or create one
          let lead = a.email
            ? await prisma.lead.findFirst({ where: { email: a.email.toLowerCase().trim() } })
            : null;

          if (!lead) {
            lead = await prisma.lead.create({
              data: {
                name: a.name,
                email: a.email?.toLowerCase().trim() || null,
                source: 'referral',
                stage: 'new',
                managedClientId: managedClientId || null,
              },
            });
          }

          await prisma.visit.create({
            data: {
              leadId: lead.id,
              visitorName: a.name,
              visitorEmail: a.email?.toLowerCase().trim() || null,
              purpose: 'meeting',
              visitGroupId: visitGroup.id,
              visitedAt: new Date(date),
            },
          });
        }
      } catch (visitErr) {
        console.error('Failed to auto-create visit group for training:', visitErr);
      }
    }

    // Send email notification to attendees (non-blocking)
    if (attendees && attendees.length > 0) {
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;
      if (gmailUser && gmailPass) {
        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.default.createTransport({
            service: 'gmail',
            auth: { user: gmailUser, pass: gmailPass },
          });
          const eventDate = new Date(date).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
          const durationText = duration ? ` (${duration} min)` : '';
          const companyName = event.managedClient?.companyName || '';

          await Promise.allSettled(
            attendees.map(async (a: { name: string; email: string }) => {
              // Look up recipient's language preference
              const user = await prisma.user.findFirst({
                where: { email: a.email },
                select: { language: true },
              });
              const lang = (user?.language as Language) || 'fr';

              const subject = translate('emails', 'trainingSubject', lang) + title;
              const greeting = translate('emails', 'trainingGreeting', lang);
              const scheduled = translate('emails', 'trainingScheduled', lang);
              const dateLabel = translate('emails', 'trainingDate', lang);
              const companyLabel = translate('emails', 'trainingCompany', lang);

              return transporter.sendMail({
                from: gmailUser,
                to: a.email,
                subject,
                html: `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
  <h2 style="color:#0d9488;margin:0 0 8px;">${translate('emails', 'trainingSubject', lang)}</h2>
  <p style="color:#374151;margin:0 0 16px;">${greeting} ${a.name},</p>
  <p style="color:#374151;margin:0 0 16px;">${scheduled}</p>
  <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px;">
    <p style="margin:0 0 6px;"><strong>${title}</strong></p>
    ${description ? `<p style="color:#6b7280;margin:0 0 6px;">${description}</p>` : ''}
    <p style="color:#6b7280;margin:0 0 4px;">${dateLabel} <strong>${eventDate}${durationText}</strong></p>
    ${companyName ? `<p style="color:#6b7280;margin:0;">${companyLabel} <strong>${companyName}</strong></p>` : ''}
  </div>
  <p style="color:#9ca3af;font-size:12px;margin:0;">— Atelier DSM</p>
</div>`,
              });
            })
          );
        } catch (emailErr) {
          console.error('Failed to send training notification emails:', emailErr);
        }
      }
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
