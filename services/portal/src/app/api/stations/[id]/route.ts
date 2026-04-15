import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/stations/[id] — Get single station with all relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const station = await prisma.station.findUnique({
      where: { id },
      include: {
        managedClient: true,
        invoices: {
          include: {
            machines: true,
          },
        },
        machines: {
          include: {
            machine: {
              include: {
                events: {
                  orderBy: { createdAt: 'desc' },
                  take: 5,
                },
              },
            },
          },
        },
        robotPrograms: true,
        laserPresets: true,
        stateLog: true,
        stationPC: true,
      },
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const result = {
      id: station.id,
      stationNumber: station.stationNumber,
      clientId: station.managedClientId,
      client: {
        displayName: station.managedClient.displayName,
        companyName: station.managedClient.companyName,
        email: station.managedClient.email,
        phone: station.managedClient.phone,
        address: station.managedClient.address,
        city: station.managedClient.city,
        province: station.managedClient.province,
        postalCode: station.managedClient.postalCode,
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
        latitude: sm.machine.latitude,
        longitude: sm.machine.longitude,
        recentEvents: sm.machine.events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          notes: e.notes,
          createdAt: e.createdAt.toISOString(),
        })),
      })),
      robotPrograms: station.robotPrograms.map((prog) => ({
        id: prog.id,
        name: prog.name,
        description: prog.description,
        status: prog.status,
        machineId: prog.machineId,
      })),
      laserPresets: station.laserPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        status: preset.status,
        machineId: preset.machineId,
      })),
      stateLog: station.stateLog.map((log) => ({
        id: log.id,
        source: log.source,
        machineId: log.machineId,
        timestamp: log.timestamp.toISOString(),
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
    };

    return NextResponse.json({ station: result });
  } catch (error) {
    console.error('Error fetching station:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// PATCH /api/stations/[id] — Update station details or manage machines
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const station = await prisma.station.findUnique({ where: { id } });
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    // Add machine to station
    if (body.addMachineId) {
      await prisma.stationMachine.create({
        data: {
          stationId: id,
          machineId: body.addMachineId,
        },
      });
      const updated = await getFullStation(id);
      return NextResponse.json({ station: updated });
    }

    // Remove machine from station
    if (body.removeMachineId) {
      await prisma.stationMachine.deleteMany({
        where: {
          stationId: id,
          machineId: body.removeMachineId,
        },
      });
      const updated = await getFullStation(id);
      return NextResponse.json({ station: updated });
    }

    // Regular field updates
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;

    const updated = await prisma.station.update({
      where: { id },
      data: updateData,
      include: {
        managedClient: true,
        invoices: { include: { machines: true } },
        machines: { include: { machine: true } },
        robotPrograms: true,
        laserPresets: true,
        stationPC: true,
      },
    });

    const result = {
      id: updated.id,
      stationNumber: updated.stationNumber,
      clientId: updated.managedClientId,
      client: {
        displayName: updated.managedClient.displayName,
        companyName: updated.managedClient.companyName,
        email: updated.managedClient.email,
      },
      title: updated.title,
      notes: updated.notes,
      status: updated.status,
      invoices: updated.invoices.map((inv) => ({
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
      machines: updated.machines.map((sm) => ({
        id: sm.machine.id,
        serialNumber: sm.machine.serialNumber,
        type: sm.machine.type,
        model: sm.machine.model,
        nickname: sm.machine.nickname,
        ipAddress: sm.machine.ipAddress,
        status: sm.machine.status,
      })),
      robotPrograms: updated.robotPrograms.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        machineId: p.machineId,
      })),
      laserPresets: updated.laserPresets.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        machineId: p.machineId,
      })),
      stationPC: updated.stationPC
        ? {
            id: updated.stationPC.id,
            serial: updated.stationPC.serial,
            macAddress: updated.stationPC.macAddress,
            hostname: updated.stationPC.hostname,
            nickname: updated.stationPC.nickname,
            status: updated.stationPC.status,
            lastHeartbeatAt: updated.stationPC.lastHeartbeatAt
              ? updated.stationPC.lastHeartbeatAt.toISOString()
              : null,
          }
        : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json({ station: result });
  } catch (error) {
    console.error('Error updating station:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/stations/[id] — Delete station and all related records
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const station = await prisma.station.findUnique({ where: { id } });
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    await prisma.station.delete({ where: { id } });

    return NextResponse.json({ message: 'Station deleted successfully' });
  } catch (error) {
    console.error('Error deleting station:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper to get full station with all relations
async function getFullStation(id: string) {
  const station = await prisma.station.findUnique({
    where: { id },
    include: {
      managedClient: true,
      invoices: { include: { machines: true } },
      machines: { include: { machine: true } },
      robotPrograms: true,
      laserPresets: true,
      stationPC: true,
    },
  });

  if (!station) return null;

  return {
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
    })),
    robotPrograms: station.robotPrograms.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      machineId: p.machineId,
    })),
    laserPresets: station.laserPresets.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      machineId: p.machineId,
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
  };
}
