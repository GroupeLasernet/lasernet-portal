import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { id: string };
}

// POST /api/managed-clients/[id]/contacts — Add a contact to a managed client
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, email, phone, role, photo, type, trainingPhoto, trainingInvoiceId, trainingCompleted } = body;

    if (!name || !email || !type) {
      return NextResponse.json(
        { error: 'Name, email, and type are required' },
        { status: 400 }
      );
    }

    // Check email uniqueness across all contacts
    const existingContact = await prisma.contact.findUnique({
      where: { email },
      include: { managedClient: true },
    });
    if (existingContact) {
      const businessName = existingContact.managedClient?.displayName || 'another business';
      return NextResponse.json(
        { error: `This email is already assigned to ${existingContact.name} at ${businessName}` },
        { status: 409 }
      );
    }

    // If adding a responsible person, remove existing one first
    if (type === 'responsible') {
      await prisma.contact.deleteMany({
        where: { managedClientId: id, type: 'responsible' },
      });
    }

    const contact = await prisma.contact.create({
      data: {
        managedClientId: id,
        name,
        email,
        phone: phone || null,
        role: role || null,
        photo: photo || null,
        type,
        trainingPhoto: trainingPhoto || null,
        trainingInvoiceId: trainingInvoiceId || null,
        trainingCompleted: trainingCompleted || false,
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
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding contact:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
