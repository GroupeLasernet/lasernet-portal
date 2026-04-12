import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { id: string };
}

// PATCH /api/tickets/[id] — Update ticket status, link invoice, etc.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const body = await request.json();
    const { status, linkedInvoiceId, linkedInvoiceNumber } = body;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status) updateData.status = status;
    if (linkedInvoiceId !== undefined) updateData.linkedInvoiceId = linkedInvoiceId;
    if (linkedInvoiceNumber !== undefined) updateData.linkedInvoiceNumber = linkedInvoiceNumber;

    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ ticket: result });
  } catch (error) {
    console.error('Error updating ticket:', error);
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }
}
