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
    const { name, email, phone, role, photo, type } = body;

    if (!name || !email || !type) {
      return NextResponse.json(
        { error: 'Name, email, and type are required' },
        { status: 400 }
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
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding contact:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
