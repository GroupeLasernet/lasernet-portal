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
      responsiblePerson: mc.contacts.find((c) => c.type === 'responsible')
        ? {
            id: mc.contacts.find((c) => c.type === 'responsible')!.id,
            name: mc.contacts.find((c) => c.type === 'responsible')!.name,
            email: mc.contacts.find((c) => c.type === 'responsible')!.email,
            phone: mc.contacts.find((c) => c.type === 'responsible')!.phone || '',
            role: mc.contacts.find((c) => c.type === 'responsible')!.role || '',
            photo: mc.contacts.find((c) => c.type === 'responsible')!.photo || null,
          }
        : null,
      subEmployees: mc.contacts
        .filter((c) => c.type === 'employee')
        .map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone || '',
          role: c.role || '',
          photo: c.photo || null,
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
