import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/jobs/[id] — Get single job with all relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
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
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const result = {
      id: job.id,
      jobNumber: job.jobNumber,
      clientId: job.managedClientId,
      client: {
        displayName: job.managedClient.displayName,
        companyName: job.managedClient.companyName,
        email: job.managedClient.email,
        phone: job.managedClient.phone,
        address: job.managedClient.address,
        city: job.managedClient.city,
        province: job.managedClient.province,
        postalCode: job.managedClient.postalCode,
      },
      title: job.title,
      notes: job.notes,
      status: job.status,
      invoices: job.invoices.map((inv) => ({
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
      machines: job.machines.map((jm) => ({
        id: jm.machine.id,
        serialNumber: jm.machine.serialNumber,
        type: jm.machine.type,
        model: jm.machine.model,
        nickname: jm.machine.nickname,
        ipAddress: jm.machine.ipAddress,
        status: jm.machine.status,
        address: jm.machine.address,
        city: jm.machine.city,
        province: jm.machine.province,
        latitude: jm.machine.latitude,
        longitude: jm.machine.longitude,
        recentEvents: jm.machine.events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          notes: e.notes,
          createdAt: e.createdAt.toISOString(),
        })),
      })),
      robotPrograms: job.robotPrograms.map((prog) => ({
        id: prog.id,
        name: prog.name,
        description: prog.description,
        status: prog.status,
        machineId: prog.machineId,
      })),
      laserPresets: job.laserPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        status: preset.status,
        machineId: preset.machineId,
      })),
      stateLog: job.stateLog.map((log) => ({
        id: log.id,
        source: log.source,
        machineId: log.machineId,
        timestamp: log.timestamp.toISOString(),
      })),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };

    return NextResponse.json({ job: result });
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// PATCH /api/jobs/[id] — Update job details or manage machines
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Add machine to job
    if (body.addMachineId) {
      await prisma.jobMachine.create({
        data: {
          jobId: id,
          machineId: body.addMachineId,
        },
      });
      const updated = await getFullJob(id);
      return NextResponse.json({ job: updated });
    }

    // Remove machine from job
    if (body.removeMachineId) {
      await prisma.jobMachine.deleteMany({
        where: {
          jobId: id,
          machineId: body.removeMachineId,
        },
      });
      const updated = await getFullJob(id);
      return NextResponse.json({ job: updated });
    }

    // Regular field updates
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;

    const updated = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        managedClient: true,
        invoices: { include: { machines: true } },
        machines: { include: { machine: true } },
        robotPrograms: true,
        laserPresets: true,
      },
    });

    const result = {
      id: updated.id,
      jobNumber: updated.jobNumber,
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
      machines: updated.machines.map((jm) => ({
        id: jm.machine.id,
        serialNumber: jm.machine.serialNumber,
        type: jm.machine.type,
        model: jm.machine.model,
        nickname: jm.machine.nickname,
        ipAddress: jm.machine.ipAddress,
        status: jm.machine.status,
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
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json({ job: result });
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/jobs/[id] — Delete job and all related records
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    await prisma.job.delete({ where: { id } });

    return NextResponse.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper to get full job with all relations
async function getFullJob(id: string) {
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      managedClient: true,
      invoices: { include: { machines: true } },
      machines: { include: { machine: true } },
      robotPrograms: true,
      laserPresets: true,
    },
  });

  if (!job) return null;

  return {
    id: job.id,
    jobNumber: job.jobNumber,
    clientId: job.managedClientId,
    client: {
      displayName: job.managedClient.displayName,
      companyName: job.managedClient.companyName,
      email: job.managedClient.email,
    },
    title: job.title,
    notes: job.notes,
    status: job.status,
    invoices: job.invoices.map((inv) => ({
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
    machines: job.machines.map((jm) => ({
      id: jm.machine.id,
      serialNumber: jm.machine.serialNumber,
      type: jm.machine.type,
      model: jm.machine.model,
      nickname: jm.machine.nickname,
      ipAddress: jm.machine.ipAddress,
      status: jm.machine.status,
    })),
    robotPrograms: job.robotPrograms.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      machineId: p.machineId,
    })),
    laserPresets: job.laserPresets.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      machineId: p.machineId,
    })),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
