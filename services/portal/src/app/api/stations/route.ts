import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/stations — List all stations with optional clientId filter
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId');

    const where = clientId ? { managedClientId: clientId } : {};

    const stations = await prisma.station.findMany({
      where,
      include: {
        managedClient: true,
        invoices: {
          include: {
            machines: true,
          },
        },
        machines: {
          include: {
            machine: true,
          },
        },
        robotPrograms: true,
        laserPresets: true,
        stationPC: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = stations.map((station) => ({
      id: station.id,
      stationNumber: station.stationNumber,
      clientId: station.managedClientId,
      client: {
        displayName: station.managedClient.displayName,
        companyName: station.managedClient.companyName,
        email: station.managedClient.email,
      },
      title: station.title,
      notes: station.notes,
      status: station.status,
      invoices: station.invoices.map((inv) => ({
        id: inv.id,
        qbInvoiceId: inv.qbInvoiceId,
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType,
        amount: inv.amount,
        linkedAt: inv.linkedAt.toISOString(),
        machines: inv.machines.map((m) => ({
          id: m.id,
          serialNumber: m.serialNumber,
          type: m.type,
          model: m.model,
          status: m.status,
        })),
      })),
      machines: station.machines.map((sm) => ({
        id: sm.machine.id,
        serialNumber: sm.machine.serialNumber,
        type: sm.machine.type,
        model: sm.machine.model,
        nickname: sm.machine.nickname,
        ipAddress: sm.machine.ipAddress,
        status: sm.machine.status,
        address: sm.machine.address,
        city: sm.machine.city,
        province: sm.machine.province,
      })),
      robotPrograms: station.robotPrograms.map((prog) => ({
        id: prog.id,
        name: prog.name,
        status: prog.status,
        machineId: prog.machineId,
      })),
      laserPresets: station.laserPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        status: preset.status,
        machineId: preset.machineId,
      })),
      stationPC: station.stationPC
        ? {
            id: station.stationPC.id,
            serial: station.stationPC.serial,
            macAddress: station.stationPC.macAddress,
            hostname: station.stationPC.hostname,
            nickname: station.stationPC.nickname,
            status: station.stationPC.status,
            lastHeartbeatAt: station.stationPC.lastHeartbeatAt
              ? station.stationPC.lastHeartbeatAt.toISOString()
              : null,
          }
        : null,
      createdAt: station.createdAt.toISOString(),
      updatedAt: station.updatedAt.toISOString(),
    }));

    return NextResponse.json({ stations: result });
  } catch (error) {
    console.error('Error fetching stations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/stations — Create a new station (invoice-first: client + title, then link invoices & machines)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { managedClientId, title, notes } = body;

    if (!managedClientId || !title) {
      return NextResponse.json(
        { error: 'managedClientId and title are required' },
        { status: 400 }
      );
    }

    // Verify client exists
    const client = await prisma.managedClient.findUnique({
      where: { id: managedClientId },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Generate station number
    const lastStation = await prisma.station.findFirst({
      orderBy: { stationNumber: 'desc' },
    });
    const lastNum = lastStation ? parseInt(lastStation.stationNumber.replace(/^[A-Z]+-/, '')) || 0 : 0;
    const stationNumber = `STN-${String(lastNum + 1).padStart(3, '0')}`;

    const station = await prisma.station.create({
      data: {
        stationNumber,
        managedClientId,
        title,
        notes: notes || null,
        status: 'not_configured',
      },
      include: {
        managedClient: true,
        invoices: true,
        machines: { include: { machine: true } },
        robotPrograms: true,
        laserPresets: true,
      },
    });

    const result = {
      id: station.id,
      stationNumber: station.stationNumber,
      clientId: station.managedClientId,
      client: {
        displayName: station.managedClient.displayName,
        companyName: station.managedClient.companyName,
        email: station.managedClient.email,
      },
      title: station.title,
      notes: station.notes,
      status: station.status,
      invoices: [],
      machines: [],
      robotPrograms: [],
      laserPresets: [],
      stationPC: null,
      createdAt: station.createdAt.toISOString(),
      updatedAt: station.updatedAt.toISOString(),
    };

    return NextResponse.json({ station: result }, { status: 201 });
  } catch (error) {
    console.error('Error creating station:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
