import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
  presetId: string;
}

// GET /api/stations/[id]/laser-presets/[presetId] — Get single preset
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id, presetId } = params;

    const preset = await prisma.stationLaserPreset.findUnique({
      where: { id: presetId },
    });

    if (!preset || preset.stationId !== id) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    const result = {
      id: preset.id,
      stationId: preset.stationId,
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

    return NextResponse.json({ preset: result });
  } catch (error) {
    console.error('Error fetching laser preset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/stations/[id]/laser-presets/[presetId] — Update preset
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id, presetId } = params;
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
    } = body;

    const preset = await prisma.stationLaserPreset.findUnique({
      where: { id: presetId },
    });

    if (!preset || preset.stationId !== id) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    const updated = await prisma.stationLaserPreset.update({
      where: { id: presetId },
      data: {
        name: name !== undefined ? name : preset.name,
        description: description !== undefined ? description : preset.description,
        status: status !== undefined ? status : preset.status,
        registers:
          registers !== undefined
            ? typeof registers === 'string'
              ? registers
              : JSON.stringify(registers)
            : preset.registers,
        port: port !== undefined ? port : preset.port,
        baudRate: baudRate !== undefined ? baudRate : preset.baudRate,
        parity: parity !== undefined ? parity : preset.parity,
        slaveId: slaveId !== undefined ? slaveId : preset.slaveId,
        rs485Mode: rs485Mode !== undefined ? rs485Mode : preset.rs485Mode,
      },
    });

    const result = {
      id: updated.id,
      stationId: updated.stationId,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      registers: JSON.parse(updated.registers),
      port: updated.port,
      baudRate: updated.baudRate,
      parity: updated.parity,
      slaveId: updated.slaveId,
      rs485Mode: updated.rs485Mode,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json({ preset: result });
  } catch (error) {
    console.error('Error updating laser preset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/stations/[id]/laser-presets/[presetId] — Delete preset
export async function DELETE(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id, presetId } = params;

    const preset = await prisma.stationLaserPreset.findUnique({
      where: { id: presetId },
    });

    if (!preset || preset.stationId !== id) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    await prisma.stationLaserPreset.delete({
      where: { id: presetId },
    });

    return NextResponse.json({ message: 'Preset deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting laser preset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
