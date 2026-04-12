import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
}

// GET /api/jobs/[id]/laser-presets — List laser presets for a job
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const presets = await prisma.jobLaserPreset.findMany({
      where: { jobId: id },
      orderBy: { createdAt: 'desc' },
    });

    const result = presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      status: preset.status,
      createdBy: preset.createdBy,
      createdAt: preset.createdAt.toISOString(),
      updatedAt: preset.updatedAt.toISOString(),
    }));

    return NextResponse.json({ presets: result });
  } catch (error) {
    console.error('Error fetching laser presets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/jobs/[id]/laser-presets — Save a laser preset to a job
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;
    const body = await request.json();
    const {
      name,
      description,
      status,
      registers,
      port,
      baudRate,
      parity,
      slaveId,
      rs485Mode,
      createdBy,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const preset = await prisma.jobLaserPreset.create({
      data: {
        jobId: id,
        name,
        description: description || null,
        status: status || 'development',
        registers: typeof registers === 'string' ? registers : JSON.stringify(registers || {}),
        port: port || null,
        baudRate: baudRate || null,
        parity: parity || null,
        slaveId: slaveId || null,
        rs485Mode: rs485Mode || 'normal',
        createdBy: createdBy || null,
      },
    });

    const result = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      status: preset.status,
      registers: JSON.parse(preset.registers),
      port: preset.port,
      baudRate: preset.baudRate,
      parity: preset.parity,
      slaveId: preset.slaveId,
      rs485Mode: preset.rs485Mode,
      createdBy: preset.createdBy,
      createdAt: preset.createdAt.toISOString(),
      updatedAt: preset.updatedAt.toISOString(),
    };

    return NextResponse.json({ preset: result }, { status: 201 });
  } catch (error) {
    console.error('Error creating laser preset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
