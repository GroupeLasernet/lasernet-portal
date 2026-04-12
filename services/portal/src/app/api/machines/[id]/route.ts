import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/machines/[id] — Get a single machine with full history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const machine = await prisma.machine.findUnique({
      where: { id },
      include: {
        managedClient: true,
        invoice: {
          include: { job: true },
        },
        events: {
          orderBy: { createdAt: 'desc' },
        },
        jobs: {
          include: {
            job: {
              include: {
                invoices: true,
              },
            },
          },
        },
        robotPrograms: true,
        laserPresets: true,
        stateLog: {
          orderBy: { timestamp: 'desc' },
          take: 20,
        },
      },
    });

    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    return NextResponse.json({ machine });
  } catch (error) {
    console.error('Error fetching machine:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/machines/[id] — Update machine details or perform lifecycle events
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const machine = await prisma.machine.findUnique({
      where: { id },
      include: { managedClient: true },
    });

    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    // If this is a lifecycle event (reassign, relocate, repair, refund, model_change)
    if (body.event) {
      const { event } = body;
      const eventData: Record<string, unknown> = {
        machineId: id,
        eventType: event.type,
        notes: event.notes || null,
        createdBy: event.createdBy || null,
      };

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      switch (event.type) {
        case 'reassigned': {
          if (!event.toClientId) {
            return NextResponse.json({ error: 'toClientId is required for reassignment' }, { status: 400 });
          }
          eventData.fromClientId = machine.managedClientId;
          eventData.toClientId = event.toClientId;
          updateData.managedClientId = event.toClientId;
          break;
        }

        case 'relocated': {
          eventData.fromAddress = [machine.address, machine.city, machine.province].filter(Boolean).join(', ');
          eventData.toAddress = [event.address, event.city, event.province].filter(Boolean).join(', ');
          eventData.fromIp = machine.ipAddress;
          eventData.toIp = event.ipAddress || machine.ipAddress;

          if (event.address !== undefined) updateData.address = event.address;
          if (event.city !== undefined) updateData.city = event.city;
          if (event.province !== undefined) updateData.province = event.province;
          if (event.postalCode !== undefined) updateData.postalCode = event.postalCode;
          if (event.country !== undefined) updateData.country = event.country;
          if (event.latitude !== undefined) updateData.latitude = event.latitude;
          if (event.longitude !== undefined) updateData.longitude = event.longitude;
          if (event.ipAddress !== undefined) updateData.ipAddress = event.ipAddress;
          break;
        }

        case 'repair': {
          updateData.status = 'in_repair';
          break;
        }

        case 'refund': {
          updateData.status = 'refunded';
          updateData.managedClientId = null;
          eventData.fromClientId = machine.managedClientId;
          break;
        }

        case 'model_change': {
          if (event.newModel) updateData.model = event.newModel;
          if (event.newSerialNumber) updateData.serialNumber = event.newSerialNumber;
          break;
        }

        case 'reactivated': {
          updateData.status = 'active';
          break;
        }

        default:
          return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
      }

      // Create event and update machine in a transaction
      const [updatedMachine] = await prisma.$transaction([
        prisma.machine.update({
          where: { id },
          data: updateData,
          include: {
            managedClient: true,
            invoice: true,
            events: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        }),
        prisma.machineEvent.create({ data: eventData as Parameters<typeof prisma.machineEvent.create>[0]['data'] }),
      ]);

      return NextResponse.json({ machine: updatedMachine });
    }

    // Regular field update (no lifecycle event)
    const allowedFields = [
      'serialNumber', 'type', 'model', 'nickname', 'ipAddress',
      'address', 'city', 'province', 'postalCode', 'country',
      'latitude', 'longitude', 'status', 'managedClientId', 'invoiceId',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const updatedMachine = await prisma.machine.update({
      where: { id },
      data: updateData,
      include: {
        managedClient: true,
        invoice: true,
        events: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    return NextResponse.json({ machine: updatedMachine });
  } catch (error) {
    console.error('Error updating machine:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/machines/[id] — Decommission a machine (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const machine = await prisma.machine.findUnique({ where: { id } });
    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    // Soft delete — mark as decommissioned and log event
    await prisma.$transaction([
      prisma.machine.update({
        where: { id },
        data: { status: 'decommissioned' },
      }),
      prisma.machineEvent.create({
        data: {
          machineId: id,
          eventType: 'decommissioned',
          notes: 'Machine decommissioned',
          fromClientId: machine.managedClientId,
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error decommissioning machine:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
