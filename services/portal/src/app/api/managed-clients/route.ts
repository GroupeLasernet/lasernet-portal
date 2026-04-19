import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/managed-clients — Fetch all managed clients with contacts
export async function GET() {
  try {
    const clients = await prisma.managedClient.findMany({
      include: {
        contacts: true,
      },
      orderBy: { addedAt: 'asc' },
    });

    // Transform to match the frontend ManagedClient shape
    const result = clients.map((mc) => ({
      id: mc.id,
      qbClient: {
        id: mc.qbId,
        displayName: mc.displayName,
        companyName: mc.companyName,
        email: mc.email || '',
        phone: mc.phone || '',
        address: mc.address || '',
        city: mc.city || '',
        province: mc.province || '',
        postalCode: mc.postalCode || '',
      },
      // Legacy single field — first active main contact (for backwards compat)
      responsiblePerson: (() => {
        const r = mc.contacts.find((c) => (c.type === 'maincontact' || c.type === 'responsible') && !c.archivedAt);
        if (!r) return null;
        return {
          id: r.id, name: r.name, email: r.email,
          phone: r.phone || '', role: r.role || '', photo: r.photo || null,
          trainingPhoto: r.trainingPhoto || null, trainingInvoiceId: r.trainingInvoiceId || null, trainingCompleted: r.trainingCompleted || false,
        };
      })(),
      // Multiple main contacts (new)
      mainContacts: mc.contacts
        .filter((c) => (c.type === 'maincontact' || c.type === 'responsible') && !c.archivedAt)
        .map((c) => ({
          id: c.id, name: c.name, email: c.email,
          phone: c.phone || '', role: c.role || '', photo: c.photo || null,
          trainingPhoto: c.trainingPhoto || null, trainingInvoiceId: c.trainingInvoiceId || null, trainingCompleted: c.trainingCompleted || false,
        })),
      subEmployees: mc.contacts
        .filter((c) => (c.type === 'staff' || c.type === 'employee') && !c.archivedAt)
        .map((c) => ({
          id: c.id, name: c.name, email: c.email,
          phone: c.phone || '', role: c.role || '', photo: c.photo || null,
          trainingPhoto: c.trainingPhoto || null, trainingInvoiceId: c.trainingInvoiceId || null, trainingCompleted: c.trainingCompleted || false,
        })),
      // Archived contacts (all types)
      archivedContacts: mc.contacts
        .filter((c) => !!c.archivedAt)
        .map((c) => ({
          id: c.id, name: c.name, email: c.email, type: c.type,
          phone: c.phone || '', role: c.role || '', photo: c.photo || null,
          trainingPhoto: c.trainingPhoto || null, trainingInvoiceId: c.trainingInvoiceId || null, trainingCompleted: c.trainingCompleted || false,
          archivedAt: c.archivedAt!.toISOString(),
        })),
      addedAt: mc.addedAt.toISOString().split('T')[0],
    }));

    return NextResponse.json({ clients: result });
  } catch (error) {
    console.error('Error fetching managed clients:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/managed-clients — Add a QB client to managed list
export async function POST(request: NextRequest) {
  try {
    const { qbClient } = await request.json();

    if (!qbClient || !qbClient.id) {
      return NextResponse.json({ error: 'QB client data is required' }, { status: 400 });
    }

    // Check if already added
    const existing = await prisma.managedClient.findUnique({
      where: { qbId: qbClient.id },
    });
    if (existing) {
      return NextResponse.json({ error: 'Client already added' }, { status: 409 });
    }

    const mc = await prisma.managedClient.create({
      data: {
        qbId: qbClient.id,
        displayName: qbClient.displayName || '',
        companyName: qbClient.companyName || '',
        email: qbClient.email || null,
        phone: qbClient.phone || null,
        address: qbClient.address || null,
        city: qbClient.city || null,
        province: qbClient.province || null,
        postalCode: qbClient.postalCode || null,
      },
      include: { contacts: true },
    });

    const result = {
      id: mc.id,
      qbClient: {
        id: mc.qbId,
        displayName: mc.displayName,
        companyName: mc.companyName,
        email: mc.email || '',
        phone: mc.phone || '',
        address: mc.address || '',
        city: mc.city || '',
        province: mc.province || '',
        postalCode: mc.postalCode || '',
      },
      responsiblePerson: null,
      subEmployees: [],
      addedAt: mc.addedAt.toISOString().split('T')[0],
    };

    return NextResponse.json({ client: result }, { status: 201 });
  } catch (error) {
    console.error('Error adding managed client:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
