import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/jobs — List all jobs with optional clientId filter
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId');

    const where = clientId ? { managedClientId: clientId } : {};

    const jobs = await prisma.job.findMany({
      where,
      include: {
        managedClient: true,
        invoices: true,
        robotPrograms: true,
        laserPresets: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = jobs.map((job) => ({
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
        status: prog.status,
      })),
      laserPresets: job.laserPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        status: preset.status,
      })),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));

    return NextResponse.json({ jobs: result });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/jobs — Create a new job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      managedClientId,
      title,
      machineType,
      notes,
      robotModel,
      laserModel,
      robotSerialNumber,
      laserSerialNumber,
    } = body;

    if (!managedClientId || !title || !machineType) {
      return NextResponse.json(
        { error: 'managedClientId, title, and machineType are required' },
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

    // Generate job number
    const lastJob = await prisma.job.findFirst({
      orderBy: { jobNumber: 'desc' },
    });
    const lastNum = lastJob ? parseInt(lastJob.jobNumber.split('-')[1]) || 0 : 0;
    const jobNumber = `JOB-${String(lastNum + 1).padStart(3, '0')}`;

    const job = await prisma.job.create({
      data: {
        jobNumber,
        managedClientId,
        title,
        notes: notes || null,
        machineType,
        robotModel: robotModel || null,
        laserModel: laserModel || null,
        robotSerialNumber: robotSerialNumber || null,
        laserSerialNumber: laserSerialNumber || null,
        status: 'draft',
      },
      include: {
        managedClient: true,
        invoices: true,
        robotPrograms: true,
        laserPresets: true,
      },
    });

    const result = {
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
      machineType: job.machineType,
      robotModel: job.robotModel,
      laserModel: job.laserModel,
      robotSerialNumber: job.robotSerialNumber,
      laserSerialNumber: job.laserSerialNumber,
      invoices: job.invoices,
      robotPrograms: job.robotPrograms,
      laserPresets: job.laserPresets,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };

    return NextResponse.json({ job: result }, { status: 201 });
  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
