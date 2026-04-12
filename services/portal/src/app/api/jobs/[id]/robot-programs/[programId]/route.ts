import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
  programId: string;
}

// GET /api/jobs/[id]/robot-programs/[programId] — Get single program with full waypoint data
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id, programId } = params;

    const program = await prisma.jobRobotProgram.findUnique({
      where: { id: programId },
    });

    if (!program || program.jobId !== id) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    const result = {
      id: program.id,
      jobId: program.jobId,
      name: program.name,
      description: program.description,
      status: program.status,
      dxfFilename: program.dxfFilename,
      dxfData: program.dxfData,
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

    return NextResponse.json({ program: result });
  } catch (error) {
    console.error('Error fetching robot program:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/jobs/[id]/robot-programs/[programId] — Update program
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id, programId } = params;
    const body = await request.json();
    const {
      name,
      description,
      status,
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
    } = body;

    const program = await prisma.jobRobotProgram.findUnique({
      where: { id: programId },
    });

    if (!program || program.jobId !== id) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    const updated = await prisma.jobRobotProgram.update({
      where: { id: programId },
      data: {
        name: name !== undefined ? name : program.name,
        description: description !== undefined ? description : program.description,
        status: status !== undefined ? status : program.status,
        waypoints: waypoints !== undefined ? JSON.stringify(waypoints) : program.waypoints,
        speed: speed !== undefined ? speed : program.speed,
        acceleration: acceleration !== undefined ? acceleration : program.acceleration,
        blendRadius: blendRadius !== undefined ? blendRadius : program.blendRadius,
        originX: originX !== undefined ? originX : program.originX,
        originY: originY !== undefined ? originY : program.originY,
        originZ: originZ !== undefined ? originZ : program.originZ,
        orientationRx: orientationRx !== undefined ? orientationRx : program.orientationRx,
        orientationRy: orientationRy !== undefined ? orientationRy : program.orientationRy,
        orientationRz: orientationRz !== undefined ? orientationRz : program.orientationRz,
        approachHeight: approachHeight !== undefined ? approachHeight : program.approachHeight,
      },
    });

    const result = {
      id: updated.id,
      jobId: updated.jobId,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      dxfFilename: updated.dxfFilename,
      dxfData: updated.dxfData,
      waypoints: updated.waypoints ? JSON.parse(updated.waypoints) : null,
      speed: updated.speed,
      acceleration: updated.acceleration,
      blendRadius: updated.blendRadius,
      originX: updated.originX,
      originY: updated.originY,
      originZ: updated.originZ,
      orientationRx: updated.orientationRx,
      orientationRy: updated.orientationRy,
      orientationRz: updated.orientationRz,
      approachHeight: updated.approachHeight,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json({ program: result });
  } catch (error) {
    console.error('Error updating robot program:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/jobs/[id]/robot-programs/[programId] — Delete program
export async function DELETE(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id, programId } = params;

    const program = await prisma.jobRobotProgram.findUnique({
      where: { id: programId },
    });

    if (!program || program.jobId !== id) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    await prisma.jobRobotProgram.delete({
      where: { id: programId },
    });

    return NextResponse.json({ message: 'Program deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting robot program:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
