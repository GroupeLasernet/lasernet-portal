import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/machines — List all machines with optional filters
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId');
    const type = request.nextUrl.searchParams.get('type');
    const status = request.nextUrl.searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (clientId) where.managedClientId = clientId;
    if (type) where.type = type;
    if (status) where.status = status;

    const machines = await prisma.machine.findMany({
      where,
      include: {
        managedClient: true,
        invoice: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        stations: {
          include: { station: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = machines.map((m) => ({
      id: m.id,
      serialNumber: m.serialNumber,
      type: m.type,
      model: m.model,
      nickname: m.nickname,
      macAddress: m.macAddress,
      ipAddress: m.ipAddress,
      address: m.address,
      city: m.city,
      province: m.province,
      postalCode: m.postalCode,
      country: m.country,
      latitude: m.latitude,
      longitude: m.longitude,
      status: m.status,
      client: m.managedClient
        ? {
            id: m.managedClient.id,
            displayName: m.managedClient.displayName,
            companyName: m.managedClient.companyName,
          }
        : null,
      invoice: m.invoice
        ? {
            id: m.invoice.id,
            invoiceNumber: m.invoice.invoiceNumber,
          }
        : null,
      recentEvents: m.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        notes: e.notes,
        createdAt: e.createdAt.toISOString(),
      })),
      stations: m.stations.map((sm) => ({
        id: sm.station.id,
        stationNumber: sm.station.stationNumber,
        title: sm.station.title,
        status: sm.station.status,
      })),
      // §9.1 licensing
      licenseMode: m.licenseMode,
      expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
      killSwitchActive: m.killSwitchActive,
      licenseLastCheckedAt: m.licenseLastCheckedAt
        ? m.licenseLastCheckedAt.toISOString()
        : null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    return NextResponse.json({ machines: result });
  } catch (error) {
    console.error('Error fetching machines:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/machines — Create a new machine
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      serialNumber,
      type,
      model,
      nickname,
      macAddress,
      ipAddress,
      address,
      city,
      province,
      postalCode,
      country,
      latitude,
      longitude,
      managedClientId,
      invoiceId,
    } = body;

    if (!serialNumber || !type || !model) {
      return NextResponse.json(
        { error: 'serialNumber, type, and model are required' },
        { status: 400 }
      );
    }

    if (!['robot', 'laser'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "robot" or "laser"' },
        { status: 400 }
      );
    }

    // Check for duplicate serial number
    const existing = await prisma.machine.findUnique({
      where: { serialNumber },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'A machine with this serial number already exists' },
        { status: 409 }
      );
    }

    // Normalise MAC (lowercased); enforce uniqueness-if-set.
    const normalizedMac =
      typeof macAddress === 'string' && macAddress.trim()
        ? macAddress.trim().toLowerCase()
        : null;
    if (normalizedMac) {
      const macClash = await prisma.machine.findUnique({
        where: { macAddress: normalizedMac },
      });
      if (macClash) {
        return NextResponse.json(
          { error: 'A machine with this MAC address already exists' },
          { status: 409 }
        );
      }
    }

    const machine = await prisma.machine.create({
      data: {
        serialNumber,
        type,
        model,
        nickname: nickname || null,
        macAddress: normalizedMac,
        ipAddress: ipAddress || null,
        address: address || null,
        city: city || null,
        province: province || null,
        postalCode: postalCode || null,
        country: country || 'Canada',
        latitude: latitude || null,
        longitude: longitude || null,
        managedClientId: managedClientId || null,
        invoiceId: invoiceId || null,
        status: 'active',
      },
      include: {
        managedClient: true,
        invoice: true,
      },
    });

    // Create initial "installed" event
    await prisma.machineEvent.create({
      data: {
        machineId: machine.id,
        eventType: 'installed',
        notes: `Machine ${serialNumber} (${model}) registered`,
        toClientId: managedClientId || null,
        toAddress: [address, city, province, postalCode].filter(Boolean).join(', ') || null,
        toIp: ipAddress || null,
      },
    });

    return NextResponse.json({ machine }, { status: 201 });
  } catch (error) {
    console.error('Error creating machine:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
