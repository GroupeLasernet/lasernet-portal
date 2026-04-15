import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/station-pcs/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pc = await prisma.stationPC.findUnique({
      where: { id },
      include: {
        station: { include: { managedClient: true } },
      },
    });
    if (!pc) {
      return NextResponse.json({ error: 'Station PC not found' }, { status: 404 });
    }
    return NextResponse.json({ stationPC: pc });
  } catch (error) {
    console.error('Error fetching station PC:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/station-pcs/[id]
// Body: any subset of { serial, macAddress, hostname, nickname, notes, status }
// Also: { assignToStationId: string | null } — attaches/detaches this PC to a Station.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.stationPC.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Station PC not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (typeof body.serial === 'string' && body.serial.trim()) {
      data.serial = body.serial.trim();
    }
    if (body.macAddress !== undefined) {
      data.macAddress =
        typeof body.macAddress === 'string' && body.macAddress.trim()
          ? body.macAddress.trim().toLowerCase()
          : null;
    }
    if (body.hostname !== undefined) data.hostname = body.hostname?.trim() || null;
    if (body.nickname !== undefined) data.nickname = body.nickname?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.status !== undefined) {
      const allowed = ['provisioning', 'online', 'offline', 'retired'];
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of ${allowed.join(', ')}` },
          { status: 400 }
        );
      }
      data.status = body.status;
    }
    if (typeof body.approved === 'boolean') {
      data.approved = body.approved;
    }

    const pc = await prisma.stationPC.update({
      where: { id },
      data,
    });

    // Station assignment: null to detach, a station id to attach.
    if ('assignToStationId' in body) {
      const targetStationId: string | null = body.assignToStationId ?? null;

      // Always detach any Station currently pointing at this PC first, so the
      // unique constraint on Station.stationPCId can't bite us during the swap.
      await prisma.station.updateMany({
        where: { stationPCId: id },
        data: { stationPCId: null },
      });

      if (targetStationId) {
        // Also detach whatever PC that Station currently has (1-to-1).
        await prisma.station.update({
          where: { id: targetStationId },
          data: { stationPCId: id },
        });
      }
    }

    const refreshed = await prisma.stationPC.findUnique({
      where: { id },
      include: { station: { include: { managedClient: true } } },
    });

    return NextResponse.json({ stationPC: refreshed });
  } catch (error) {
    console.error('Error updating station PC:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/station-pcs/[id] — retire a PC (soft-preferred; hard delete allowed)
// Query: ?hard=1 forces hard delete. Default soft-retires (status=retired).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const hard = request.nextUrl.searchParams.get('hard') === '1';

    const existing = await prisma.stationPC.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Station PC not found' }, { status: 404 });
    }

    if (hard) {
      await prisma.stationPC.delete({ where: { id } });
      return NextResponse.json({ ok: true, deleted: true });
    }

    const pc = await prisma.stationPC.update({
      where: { id },
      data: { status: 'retired' },
    });
    return NextResponse.json({ stationPC: pc });
  } catch (error) {
    console.error('Error deleting station PC:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
