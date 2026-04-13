import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
            attendees.map((a: { name: string; email: string }) =>
              transporter.sendMail({
                from: gmailUser,
                to: a.email,
                subject: `Training Scheduled: ${title}`,
                html: `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
  <h2 style="color:#0d9488;margin:0 0 8px;">Training Scheduled</h2>
  <p style="color:#374151;margin:0 0 16px;">Hi ${a.name},</p>
  <p style="color:#374151;margin:0 0 16px;">You have been scheduled for a training session:</p>
  <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px;">
    <p style="margin:0 0 6px;"><strong>${title}</strong></p>
    ${description ? `<p style="color:#6b7280;margin:0 0 6px;">${description}</p>` : ''}
    <p style="color:#6b7280;margin:0 0 4px;">Date: <strong>${eventDate}${durationText}</strong></p>
    ${companyName ? `<p style="color:#6b7280;margin:0;">Company: <strong>${companyName}</strong></p>` : ''}
  </div>
  <p style="color:#9ca3af;font-size:12px;margin:0;">— Atelier DSM</p>
</div>`,
              })
            )
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
