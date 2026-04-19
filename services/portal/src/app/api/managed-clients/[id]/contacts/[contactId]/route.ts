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
    const { name, email, phone, role, photo, trainingPhoto, trainingInvoiceId, trainingCompleted, archivedAt } = body;
    let { type, managedClientId } = body as { type?: string; managedClientId?: string };

    // Check email uniqueness if email is being changed
    if (email !== undefined) {
      const existingContact = await prisma.contact.findFirst({
        where: { email },
        include: { managedClient: true },
      });
      if (existingContact && existingContact.id !== contactId) {
        const businessName = existingContact.managedClient?.displayName || 'another business';
        return NextResponse.json(
          { error: `This email is already assigned to ${existingContact.name} at ${businessName}` },
          { status: 409 }
        );
      }
    }

    // Normalize legacy type values
    if (type === 'responsible') type = 'maincontact';
    if (type === 'main') type = 'maincontact';
    if (type === 'employee') type = 'staff';
    if (type !== undefined && type !== 'maincontact' && type !== 'staff') {
      return NextResponse.json(
        { error: 'type must be "maincontact" or "staff"' },
        { status: 400 }
      );
    }

    // Reassignment: moving this contact to a different ManagedClient.
    // Validate the target client exists so we fail fast with a clear error.
    if (managedClientId !== undefined) {
      const target = await prisma.managedClient.findUnique({ where: { id: managedClientId } });
      if (!target) {
        return NextResponse.json({ error: 'Target ManagedClient not found' }, { status: 404 });
      }
    }

    // Multiple main contacts are now allowed per client.
    // (Single-main-contact enforcement removed 2026-04-19.)

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(role !== undefined && { role: role || null }),
        ...(photo !== undefined && { photo: photo || null }),
        ...(type !== undefined && { type }),
        ...(managedClientId !== undefined && { managedClientId }),
        // archivedAt: send ISO string to archive, send null to restore
        ...(archivedAt !== undefined && { archivedAt: archivedAt ? new Date(archivedAt) : null }),
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
        archivedAt: contact.archivedAt ? contact.archivedAt.toISOString() : null,
        type: contact.type,
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
