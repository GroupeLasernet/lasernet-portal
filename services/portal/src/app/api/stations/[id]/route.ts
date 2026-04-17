import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getActorFromRequest } from '@/lib/actor';

// GET /api/stations/[id] — Get single station with all relations
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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
      addressLine: station.addressLine,
      city: station.city,
      province: station.province,
      postalCode: station.postalCode,
      country: station.country,
      addressLocked: station.addressLocked,
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
          category: m.category,
          subcategory: m.subcategory,
          type: m.category === 'accessory' && m.subcategory === 'laser' ? 'laser' : 'robot',
          model: m.model,
          status: m.status,
        })),
      })),
      machines: station.machines.map((sm) => ({
        id: sm.machine.id,
        serialNumber: sm.machine.serialNumber,
        category: sm.machine.category,
        subcategory: sm.machine.subcategory,
        type: sm.machine.category === 'accessory' && sm.machine.subcategory === 'laser' ? 'laser' : 'robot',
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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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

    // Address fields — `null`/`""` clears to fall back to business address.
    // We intentionally accept each field independently so the client can
    // send a partial patch without wiping siblings.
    const addressKeys = ['addressLine', 'city', 'province', 'postalCode', 'country'] as const;
    for (const key of addressKeys) {
      if (body[key] !== undefined) {
        const val = body[key];
        updateData[key] =
          typeof val === 'string' && val.trim() !== '' ? val.trim() : null;
      }
    }
    if (typeof body.addressLocked === 'boolean') {
      updateData.addressLocked = body.addressLocked;
    }

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
        address: updated.managedClient.address,
        city: updated.managedClient.city,
        province: updated.managedClient.province,
        postalCode: updated.managedClient.postalCode,
      },
      title: updated.title,
      notes: updated.notes,
      status: updated.status,
      addressLine: updated.addressLine,
      city: updated.city,
      province: updated.province,
      postalCode: updated.postalCode,
      country: updated.country,
      addressLocked: updated.addressLocked,
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
          category: m.category,
          subcategory: m.subcategory,
          type: m.category === 'accessory' && m.subcategory === 'laser' ? 'laser' : 'robot',
          model: m.model,
          status: m.status,
        })),
      })),
      machines: updated.machines.map((sm) => ({
        id: sm.machine.id,
        serialNumber: sm.machine.serialNumber,
        category: sm.machine.category,
        subcategory: sm.machine.subcategory,
        type: sm.machine.category === 'accessory' && sm.machine.subcategory === 'laser' ? 'laser' : 'robot',
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

// DELETE /api/stations/[id] — Delete station and all related records.
// Special handling for an attached StationPC: detach it, send it back to
// the "To be approved" queue (status=provisioning, approved=false — unless
// it's retired), and record a 'detached' event with reason='station_deleted'
// so the PC's history shows where it used to live and who unplugged it.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const station = await prisma.station.findUnique({
      where: { id },
      include: { stationPC: true },
    });
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const pc = station.stationPC;
    if (pc) {
      const actor = await getActorFromRequest(request);
      // Snapshot the station identity BEFORE we delete it — the audit row
      // has no FK on stationId, so these snapshot columns are what the UI
      // renders once the Station row is gone.
      await prisma.stationPCAssignment.create({
        data: {
          stationPCId: pc.id,
          stationId: station.id,
          stationNumber: station.stationNumber,
          stationTitle: station.title,
          action: 'detached',
          reason: 'station_deleted',
          actorEmail: actor.email,
          actorName: actor.name,
        },
      });
      // Detach first (clears Station.stationPCId on the row we're about to
      // delete — redundant but explicit). Then flip the PC back to pending
      // unless it's retired.
      await prisma.station.update({
        where: { id },
        data: { stationPCId: null },
      });
      if (pc.status !== 'retired') {
        await prisma.stationPC.update({
          where: { id: pc.id },
          data: { approved: false, status: 'provisioning' },
        });
      }
    }

    await prisma.station.delete({ where: { id } });

    return NextResponse.json({
      message: 'Station deleted successfully',
      stationPCReturned: pc ? { id: pc.id, serial: pc.serial } : null,
    });
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
        category: m.category,
        subcategory: m.subcategory,
        type: m.category === 'accessory' && m.subcategory === 'laser' ? 'laser' : 'robot',
        model: m.model,
        status: m.status,
      })),
    })),
    machines: station.machines.map((sm) => ({
      id: sm.machine.id,
      serialNumber: sm.machine.serialNumber,
      category: sm.machine.category,
      subcategory: sm.machine.subcategory,
      type: sm.machine.category === 'accessory' && sm.machine.subcategory === 'laser' ? 'laser' : 'robot',
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
