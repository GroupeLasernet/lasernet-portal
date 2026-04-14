import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
}

// GET /api/stations/[id]/robot-programs — List robot programs for a station
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;

    // Verify station exists
    const station = await prisma.station.findUnique({
      where: { id },
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const programs = await prisma.stationRobotProgram.findMany({
      where: { stationId: id },
      orderBy: { createdAt: 'desc' },
    });

    const result = programs.map((prog) => ({
      id: prog.id,
      name: prog.name,
      description: prog.description,
      status: prog.status,
      dxfFilename: prog.dxfFilename,
      createdBy: prog.createdBy,
      createdAt: prog.createdAt.toISOString(),
      updatedAt: prog.updatedAt.toISOString(),
    }));

    return NextResponse.json({ programs: result });
  } catch (error) {
    console.error('Error fetching robot programs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/stations/[id]/robot-programs — Save a robot program to a station
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;
    const body = await request.json();
    const {
      name,
      description,
      status,
      dxfFilename,
      dxfData,
      waypoints,
      speed,
      acceleration,
      blendRadius,
      originX,
      originY,
      originZ,
      orientationRx,
      orientationRy,
      orientationRz,
      approachHeight,
      createdBy,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Verify station exists
    const station = await prisma.station.findUnique({
      where: { id },
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const program = await prisma.stationRobotProgram.create({
      data: {
        stationId: id,
        name,
        description: description || null,
        status: status || 'development',
        dxfFilename: dxfFilename || null,
        dxfData: dxfData || null,
        waypoints: waypoints ? JSON.stringify(waypoints) : null,
        speed: speed || 50.0,
        acceleration: acceleration || 100.0,
        blendRadius: blendRadius || 0.5,
        originX: originX || 400.0,
        originY: originY || 0.0,
        originZ: originZ || 200.0,
        orientationRx: orientationRx || 180.0,
        orientationRy: orientationRy || 0.0,
        orientationRz: orientationRz || 0.0,
        approachHeight: approachHeight || 20.0,
        createdBy: createdBy || null,
      },
    });

    const result = {
      id: program.id,
      name: program.name,
      description: program.description,
      status: program.status,
      dxfFilename: program.dxfFilename,
      waypoints: program.waypoints ? JSON.parse(program.waypoints) : null,
      speed: program.speed,
      acceleration: program.acceleration,
      blendRadius: program.blendRadius,
      originX: program.originX,
      originY: program.originY,
      originZ: program.originZ,
      orientationRx: program.orientationRx,
      orientationRy: program.orientationRy,
      orientationRz: program.orientationRz,
      approachHeight: program.approachHeight,
      createdBy: program.createdBy,
      createdAt: program.createdAt.toISOString(),
      updatedAt: program.updatedAt.toISOString(),
    };

    return NextResponse.json({ program: result }, { status: 201 });
  } catch (error) {
    console.error('Error creating robot program:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
