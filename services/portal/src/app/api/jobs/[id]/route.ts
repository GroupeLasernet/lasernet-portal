import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
}

// GET /api/jobs/[id] — Get single job with all relations
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        managedClient: true,
        invoices: true,
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
      machineType: job.machineType,
      robotModel: job.robotModel,
      laserModel: job.laserModel,
      robotSerialNumber: job.robotSerialNumber,
      laserSerialNumber: job.laserSerialNumber,
      invoices: job.invoices.map((inv) => ({
        id: inv.id,
        qbInvoiceId: inv.qbInvoiceId,
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType,
        amount: inv.amount,
        linkedAt: inv.linkedAt.toISOString(),
      })),
      robotPrograms: job.robotPrograms.map((prog) => ({
        id: prog.id,
        name: prog.name,
        description: prog.description,
        status: prog.status,
      })),
      laserPresets: job.laserPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        status: preset.status,
      })),
      stateLog: job.stateLog.map((log) => ({
        id: log.id,
        source: log.source,
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

// POST /api/jobs/[id] — Update job
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;
    const body = await request.json();
    const {
      title,
      notes,
      status,
      machineType,
      robotModel,
      laserModel,
      robotSerialNumber,
      laserSerialNumber,
    } = body;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        managedClient: true,
        invoices: true,
        robotPrograms: true,
        laserPresets: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const updated = await prisma.job.update({
      where: { id },
      data: {
        title: title !== undefined ? title : job.title,
        notes: notes !== undefined ? notes : job.notes,
        status: status !== undefined ? status : job.status,
        machineType: machineType !== undefined ? machineType : job.machineType,
        robotModel: robotModel !== undefined ? robotModel : job.robotModel,
        laserModel: laserModel !== undefined ? laserModel : job.laserModel,
        robotSerialNumber: robotSerialNumber !== undefined ? robotSerialNumber : job.robotSerialNumber,
        laserSerialNumber: laserSerialNumber !== undefined ? laserSerialNumber : job.laserSerialNumber,
      },
      include: {
        managedClient: true,
        invoices: true,
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
      machineType: updated.machineType,
      robotModel: updated.robotModel,
      laserModel: updated.laserModel,
      robotSerialNumber: updated.robotSerialNumber,
      laserSerialNumber: updated.laserSerialNumber,
      invoices: updated.invoices,
      robotPrograms: updated.robotPrograms,
      laserPresets: updated.laserPresets,
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
export async function DELETE(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;

    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Delete cascades automatically due to Prisma schema
    await prisma.job.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Job deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
