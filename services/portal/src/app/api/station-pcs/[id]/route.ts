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
      const priorAssignments = await prisma.station.findMany({
        where: { stationPCId: id },
        select: { id: true },
      });
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
        // Assigning a PC to a Station IS an implicit approval — if the PC
        // was sitting in the "To be approved" queue (e.g. after a previous
        // unlink that flipped approved=false), flip it back to approved.
        // Retired PCs are left alone. Honour an explicit `approved: false`
        // override from the caller.
        if (
          !existing.approved &&
          existing.status !== 'retired' &&
          body.approved !== false
        ) {
          await prisma.stationPC.update({
            where: { id },
            data: { approved: true },
          });
        }
      } else if (priorAssignments.length > 0 && typeof body.approved !== 'boolean') {
        // Unlinking without a new target → send the PC back to the
        // "To be approved" queue so the operator has to explicitly
        // re-approve before it can be reassigned. Skip this if the caller
        // explicitly passed `approved` (honour the override).
        await prisma.stationPC.update({
          where: { id },
          data: {
            approved: false,
            // Keep it visible but not "online" — heartbeat handler forces
            // unapproved PCs into provisioning anyway, but set it now so the
            // UI doesn't lag until the next heartbeat.
            status: existing.status === 'retired' ? 'retired' : 'provisioning',
          },
        });
      }
    }

    const refreshed = await prisma.stationPC.findUnique({
      where: { id },
      include: { station: { include: { managedClient: true } } },
    });

    if (!refreshed) {
      return NextResponse.json({ error: 'Station PC not found after update' }, { status: 500 });
    }

    // Shape the response to match GET /api/station-pcs (mapped `client` field
    // instead of raw `managedClient`) so the admin UI doesn't crash when it
    // reads pc.station.client.displayName after a PATCH.
    const stationPC = {
      id: refreshed.id,
      serial: refreshed.serial,
      macAddress: refreshed.macAddress,
      hostname: refreshed.hostname,
      nickname: refreshed.nickname,
      installedAt: refreshed.installedAt.toISOString(),
      robotVersion: refreshed.robotVersion,
      relfarVersion: refreshed.relfarVersion,
      lastHeartbeatAt: refreshed.lastHeartbeatAt ? refreshed.lastHeartbeatAt.toISOString() : null,
      lastHeartbeatIp: refreshed.lastHeartbeatIp,
      status: refreshed.status,
      approved: refreshed.approved,
      notes: refreshed.notes,
      station: refreshed.station
        ? {
            id: refreshed.station.id,
            stationNumber: refreshed.station.stationNumber,
            title: refreshed.station.title,
            status: refreshed.station.status,
            client: {
              id: refreshed.station.managedClient.id,
              displayName: refreshed.station.managedClient.displayName,
              companyName: refreshed.station.managedClient.companyName,
            },
          }
        : null,
      createdAt: refreshed.createdAt.toISOString(),
      updatedAt: refreshed.updatedAt.toISOString(),
    };

    return NextResponse.json({ stationPC });
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
