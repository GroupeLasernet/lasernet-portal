import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/station-pcs — List all StationPCs with optional filters
// Query params: status, search (matches serial/hostname/nickname substring)
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status');
    const search = request.nextUrl.searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { serial: { contains: q, mode: 'insensitive' } },
        { hostname: { contains: q, mode: 'insensitive' } },
        { nickname: { contains: q, mode: 'insensitive' } },
        { macAddress: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Self-heal pass: any PC with a Station bound AND status='retired' is in
    // an inconsistent state — the PC got reassigned via a path that didn't
    // revive it (or the revival fix landed after the row got into this
    // state). Flip it back to 'provisioning' + approved=true and log a
    // 'retired_to_assigned' system reconciliation event so Hugo sees it in
    // the PC's history. Idempotent: runs on every list fetch and no-ops
    // once the inconsistent rows are cleared.
    const stuck = await prisma.stationPC.findMany({
      where: { status: 'retired', station: { isNot: null } },
      include: { station: { select: { id: true, stationNumber: true, title: true } } },
    });
    for (const pc of stuck) {
      await prisma.stationPC.update({
        where: { id: pc.id },
        data: { status: 'provisioning', approved: true },
      });
      await prisma.stationPCAssignment.create({
        data: {
          stationPCId: pc.id,
          stationId: pc.station?.id ?? null,
          stationNumber: pc.station?.stationNumber ?? null,
          stationTitle: pc.station?.title ?? null,
          action: 'assigned',
          reason: 'reconciled',
          actorEmail: null,
          actorName: 'system',
          note: 'Auto-revived from retired — PC had a Station bound',
        },
      });
    }

    const pcs = await prisma.stationPC.findMany({
      where,
      include: {
        station: {
          include: { managedClient: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = pcs.map((pc) => ({
      id: pc.id,
      serial: pc.serial,
      macAddress: pc.macAddress,
      hostname: pc.hostname,
      nickname: pc.nickname,
      installedAt: pc.installedAt.toISOString(),
      robotVersion: pc.robotVersion,
      relfarVersion: pc.relfarVersion,
      lastHeartbeatAt: pc.lastHeartbeatAt ? pc.lastHeartbeatAt.toISOString() : null,
      lastHeartbeatIp: pc.lastHeartbeatIp,
      localIp: pc.localIp,
      status: pc.status,
      approved: pc.approved,
      notes: pc.notes,
      station: pc.station
        ? {
            id: pc.station.id,
            stationNumber: pc.station.stationNumber,
            title: pc.station.title,
            status: pc.station.status,
            client: {
              id: pc.station.managedClient.id,
              displayName: pc.station.managedClient.displayName,
              companyName: pc.station.managedClient.companyName,
            },
          }
        : null,
      createdAt: pc.createdAt.toISOString(),
      updatedAt: pc.updatedAt.toISOString(),
    }));

    return NextResponse.json({ stationPCs: result });
  } catch (error) {
    console.error('Error fetching station PCs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/station-pcs — Register a new Station PC
// Body: { serial, macAddress?, hostname?, nickname?, notes? }
// The `serial` is the stable identifier the robot service sends back in its
// heartbeat (equivalent to ROBOT_SERIAL in services/robot/.env).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serial, macAddress, hostname, nickname, notes } = body;

    if (!serial || typeof serial !== 'string' || !serial.trim()) {
      return NextResponse.json(
        { error: 'serial is required' },
        { status: 400 }
      );
    }

    const existing = await prisma.stationPC.findUnique({
      where: { serial: serial.trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'A station PC with this serial already exists' },
        { status: 409 }
      );
    }

    // Normalise MAC if provided (lower-case + colons kept as-is)
    const normalizedMac =
      typeof macAddress === 'string' && macAddress.trim()
        ? macAddress.trim().toLowerCase()
        : null;

    if (normalizedMac) {
      const macClash = await prisma.stationPC.findUnique({
        where: { macAddress: normalizedMac },
      });
      if (macClash) {
        return NextResponse.json(
          { error: 'A station PC with this MAC address already exists' },
          { status: 409 }
        );
      }
    }

    const pc = await prisma.stationPC.create({
      data: {
        serial: serial.trim(),
        macAddress: normalizedMac,
        hostname: hostname?.trim() || null,
        nickname: nickname?.trim() || null,
        notes: notes?.trim() || null,
        status: 'provisioning',
        // Manual admin-side creation is implicitly trusted.
        approved: true,
      },
    });

    return NextResponse.json({ stationPC: pc }, { status: 201 });
  } catch (error) {
    console.error('Error creating station PC:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
