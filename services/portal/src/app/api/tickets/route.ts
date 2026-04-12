import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/tickets — Fetch all tickets (with optional clientId filter)
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId');

    const where = clientId ? { managedClientId: clientId } : {};

    const tickets = await prisma.ticket.findMany({
      where,
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
    });

    const result = tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      clientId: t.managedClientId,
      clientCompanyName: t.clientCompanyName,
      createdBy: {
        name: t.createdByName,
        email: t.createdByEmail,
        role: t.createdByRole,
      },
      subject: t.subject,
      description: t.description,
      priority: t.priority,
      status: t.status,
      attachments: t.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        url: a.url,
      })),
      linkedInvoiceId: t.linkedInvoiceId,
      linkedInvoiceNumber: t.linkedInvoiceNumber,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return NextResponse.json({ tickets: result });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/tickets — Create a new ticket
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clientId,
      clientCompanyName,
      createdBy,
      subject,
      description,
      priority,
      attachments,
    } = body;

    if (!clientId || !subject || !description) {
      return NextResponse.json(
        { error: 'clientId, subject, and description are required' },
        { status: 400 }
      );
    }

    // Generate ticket number
    const lastTicket = await prisma.ticket.findFirst({
      orderBy: { ticketNumber: 'desc' },
    });
    const lastNum = lastTicket
      ? parseInt(lastTicket.ticketNumber.split('-')[1]) || 1567
      : 1567;
    const ticketNumber = `TK-${String(lastNum + 1).padStart(4, '0')}`;

    // Find the user by email if exists
    let createdByUserId: string | null = null;
    if (createdBy?.email) {
      const user = await prisma.user.findFirst({
        where: { email: { equals: createdBy.email, mode: 'insensitive' } },
      });
      if (user) createdByUserId = user.id;
    }

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        managedClientId: clientId,
        clientCompanyName: clientCompanyName || '',
        createdByUserId,
        createdByName: createdBy?.name || 'Unknown',
        createdByEmail: createdBy?.email || '',
        createdByRole: createdBy?.role || 'Client',
        subject,
        description,
        priority: priority || 'medium',
        status: 'open',
        attachments: {
          create: (attachments || []).map((a: any) => ({
            name: a.name || 'attachment',
            type: a.type || 'image',
            url: a.url || '',
          })),
        },
      },
      include: { attachments: true },
    });

    const result = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      clientId: ticket.managedClientId,
      clientCompanyName: ticket.clientCompanyName,
      createdBy: {
        name: ticket.createdByName,
        email: ticket.createdByEmail,
        role: ticket.createdByRole,
      },
      subject: ticket.subject,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      attachments: ticket.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        url: a.url,
      })),
      linkedInvoiceId: ticket.linkedInvoiceId,
      linkedInvoiceNumber: ticket.linkedInvoiceNumber,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };

    return NextResponse.json({ ticket: result }, { status: 201 });
  } catch (error) {
    console.error('Error creating ticket:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
