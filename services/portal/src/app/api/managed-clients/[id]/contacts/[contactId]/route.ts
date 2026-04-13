import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { id: string; contactId: string };
}

// PATCH /api/managed-clients/[id]/contacts/[contactId] — Update a contact
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { contactId } = params;
    const body = await request.json();
    const { name, email, phone, role, photo, trainingPhoto, trainingInvoiceId, trainingCompleted } = body;

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(role !== undefined && { role: role || null }),
        ...(photo !== undefined && { photo: photo || null }),
        ...(trainingPhoto !== undefined && { trainingPhoto: trainingPhoto || null }),
        ...(trainingInvoiceId !== undefined && { trainingInvoiceId: trainingInvoiceId || null }),
        ...(trainingCompleted !== undefined && { trainingCompleted }),
      },
    });

    return NextResponse.json({
      contact: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone || '',
        role: contact.role || '',
        photo: contact.photo || null,
        trainingPhoto: contact.trainingPhoto || null,
        trainingInvoiceId: contact.trainingInvoiceId || null,
        trainingCompleted: contact.trainingCompleted || false,
      },
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
}

// DELETE /api/managed-clients/[id]/contacts/[contactId] — Remove a contact
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { contactId } = params;

    await prisma.contact.delete({
      where: { id: contactId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
}
