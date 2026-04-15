import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Backfill missing StationMachine join rows.
 *
 * Background: the /admin/stations hold-to-save flow used to create a Machine
 * and anchor it to a StationInvoice, but never wrote the StationMachine join
 * row that ties the machine to the station. That leaves the Machines list
 * (and the "Open software" button) with no station/PC context even though
 * the data exists elsewhere.
 *
 * This pass is idempotent and safe to run on every GET /api/machines —
 * it only creates missing rows.
 */
async function backfillStationMachineLinks(): Promise<void> {
  // --- Path 1: invoiceId anchor ------------------------------------------
  // Machines with an invoiceId but no StationMachine row yet.
  const orphansByInvoice = await prisma.machine.findMany({
    where: {
      invoiceId: { not: null },
      stations: { none: {} },
    },
    select: { id: true, invoiceId: true },
  });

  for (const m of orphansByInvoice) {
    if (!m.invoiceId) continue;
    const inv = await prisma.stationInvoice.findUnique({
      where: { id: m.invoiceId },
      select: { stationId: true },
    });
    if (!inv?.stationId) continue;
    // Race-safe: skip if a row already exists.
    const exists = await prisma.stationMachine.findFirst({
      where: { stationId: inv.stationId, machineId: m.id },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.stationMachine.create({
      data: { stationId: inv.stationId, machineId: m.id },
    });
  }

  // --- Path 2: notes.machineData[].machineId anchor ----------------------
  // Handles machines that were created without an invoiceId (e.g. robots
  // added on the Stations page before the invoice was selected).
  const stillOrphans = await prisma.machine.findMany({
    where: { stations: { none: {} } },
    select: { id: true },
  });
  if (stillOrphans.length === 0) return;
  const orphanIds = new Set(stillOrphans.map((m) => m.id));

  const stations = await prisma.station.findMany({
    where: { notes: { not: null } },
    select: { id: true, notes: true },
  });

  for (const s of stations) {
    if (!s.notes) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(s.notes);
    } catch {
      continue;
    }
    const md = (parsed as { machineData?: Array<{ machineId?: string }> })?.machineData;
    if (!Array.isArray(md)) continue;
    for (const entry of md) {
      const mid = entry?.machineId;
      if (!mid || !orphanIds.has(mid)) continue;
      const exists = await prisma.stationMachine.findFirst({
        where: { stationId: s.id, machineId: mid },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.stationMachine.create({
        data: { stationId: s.id, machineId: mid },
      });
      orphanIds.delete(mid);
    }
  }
}

// GET /api/machines — List all machines with optional filters
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId');
    // Accept the new `category`/`subcategory` params *and* translate the
    // legacy `type=robot|laser` param 1:1 into the new taxonomy so old
    // links and callers keep working.
    const categoryParam = request.nextUrl.searchParams.get('category');
    const subcategoryParam = request.nextUrl.searchParams.get('subcategory');
    const legacyType = request.nextUrl.searchParams.get('type');
    const status = request.nextUrl.searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (clientId) where.managedClientId = clientId;
    if (categoryParam) where.category = categoryParam;
    if (subcategoryParam) where.subcategory = subcategoryParam;
    if (!categoryParam && legacyType === 'robot') where.category = 'robot';
    if (!categoryParam && legacyType === 'laser') {
      where.category = 'accessory';
      where.subcategory = 'laser';
    }
    if (status) where.status = status;

    // Self-heal: backfill missing StationMachine join rows so machines that
    // were created via the hold-to-save flow on /admin/stations (which
    // historically skipped the join write) still link to their station.
    //
    // Two anchor paths are checked, in order of reliability:
    //   1. Machine.invoiceId → StationInvoice.stationId (strong anchor)
    //   2. Station.notes.machineData[].machineId (legacy anchor — scans
    //      every station's JSON notes for an explicit machineId reference)
    //
    // Idempotent: we only create rows when none exist for the pair.
    try {
      await backfillStationMachineLinks();
    } catch (heErr) {
      // Don't block the list response on a self-heal failure.
      console.error('StationMachine self-heal failed:', heErr);
    }

    const machines = await prisma.machine.findMany({
      where,
      include: {
        managedClient: true,
        invoice: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        stations: {
          include: {
            station: {
              include: {
                stationPC: {
                  select: {
                    id: true,
                    serial: true,
                    hostname: true,
                    nickname: true,
                    lastHeartbeatIp: true,
                    localIp: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = machines.map((m) => ({
      id: m.id,
      serialNumber: m.serialNumber,
      // New taxonomy (source of truth)
      category: m.category,
      subcategory: m.subcategory,
      // Legacy `type` field kept as a derived alias so the older admin/machines
      // page and any external consumers don't break until they migrate.
      type: m.category === 'accessory' && m.subcategory === 'laser' ? 'laser' : 'robot',
      model: m.model,
      nickname: m.nickname,
      macAddress: m.macAddress,
      ipAddress: m.ipAddress,
      address: m.address,
      city: m.city,
      province: m.province,
      postalCode: m.postalCode,
      country: m.country,
      latitude: m.latitude,
      longitude: m.longitude,
      status: m.status,
      client: m.managedClient
        ? {
            id: m.managedClient.id,
            displayName: m.managedClient.displayName,
            companyName: m.managedClient.companyName,
          }
        : null,
      invoice: m.invoice
        ? {
            id: m.invoice.id,
            invoiceNumber: m.invoice.invoiceNumber,
          }
        : null,
      recentEvents: m.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        notes: e.notes,
        createdAt: e.createdAt.toISOString(),
      })),
      stations: m.stations.map((sm) => ({
        id: sm.station.id,
        stationNumber: sm.station.stationNumber,
        title: sm.station.title,
        status: sm.station.status,
        stationPC: sm.station.stationPC
          ? {
              id: sm.station.stationPC.id,
              serial: sm.station.stationPC.serial,
              hostname: sm.station.stationPC.hostname,
              nickname: sm.station.stationPC.nickname,
              lastHeartbeatIp: sm.station.stationPC.lastHeartbeatIp,
              localIp: sm.station.stationPC.localIp,
              status: sm.station.stationPC.status,
            }
          : null,
      })),
      // §9.1 licensing
      licenseMode: m.licenseMode,
      expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
      killSwitchActive: m.killSwitchActive,
      licenseLastCheckedAt: m.licenseLastCheckedAt
        ? m.licenseLastCheckedAt.toISOString()
        : null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    return NextResponse.json({ machines: result });
  } catch (error) {
    console.error('Error fetching machines:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/machines — Create a new machine
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      serialNumber,
      // New taxonomy (preferred input)
      category: categoryIn,
      subcategory: subcategoryIn,
      // Legacy input — `type` maps to the new category/subcategory pair
      // when category isn't supplied. Keeps old callers working.
      type,
      model,
      nickname,
      macAddress,
      ipAddress,
      address,
      city,
      province,
      postalCode,
      country,
      latitude,
      longitude,
      managedClientId,
      invoiceId,
      // Optional: link the new machine directly to a Station via the
      // StationMachine join. The /admin/stations hold-to-save flow passes
      // this so the machine shows up on the Stations page and the
      // Machines list immediately.
      stationId,
    } = body;

    // Derive canonical category/subcategory. Accepted inputs:
    //   { category: 'robot', model: 'E03' }
    //   { category: 'accessory', subcategory: 'laser', model: 'Cleaning' }
    //   { type: 'robot', model: 'E03' }                        (legacy)
    //   { type: 'laser', model: 'Cleaning' }                   (legacy)
    let category: string | null = typeof categoryIn === 'string' ? categoryIn : null;
    let subcategory: string | null =
      typeof subcategoryIn === 'string' && subcategoryIn.trim() ? subcategoryIn : null;
    if (!category && type === 'robot') category = 'robot';
    if (!category && type === 'laser') {
      category = 'accessory';
      subcategory = subcategory || 'laser';
    }

    if (!serialNumber || !category || !model) {
      return NextResponse.json(
        { error: 'serialNumber, category (or legacy type), and model are required' },
        { status: 400 }
      );
    }

    if (!['robot', 'accessory'].includes(category)) {
      return NextResponse.json(
        { error: 'category must be "robot" or "accessory"' },
        { status: 400 }
      );
    }
    if (category === 'robot' && subcategory) {
      // Robot has no subcategory — clear it rather than reject.
      subcategory = null;
    }
    if (category === 'accessory' && !subcategory) {
      return NextResponse.json(
        { error: 'subcategory is required when category is "accessory"' },
        { status: 400 }
      );
    }

    // Check for duplicate serial number
    const existing = await prisma.machine.findUnique({
      where: { serialNumber },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'A machine with this serial number already exists' },
        { status: 409 }
      );
    }

    // Normalise MAC (lowercased); enforce uniqueness-if-set.
    const normalizedMac =
      typeof macAddress === 'string' && macAddress.trim()
        ? macAddress.trim().toLowerCase()
        : null;
    if (normalizedMac) {
      const macClash = await prisma.machine.findUnique({
        where: { macAddress: normalizedMac },
      });
      if (macClash) {
        return NextResponse.json(
          { error: 'A machine with this MAC address already exists' },
          { status: 409 }
        );
      }
    }

    const machine = await prisma.machine.create({
      data: {
        serialNumber,
        category,
        subcategory,
        model,
        nickname: nickname || null,
        macAddress: normalizedMac,
        ipAddress: ipAddress || null,
        address: address || null,
        city: city || null,
        province: province || null,
        postalCode: postalCode || null,
        country: country || 'Canada',
        latitude: latitude || null,
        longitude: longitude || null,
        managedClientId: managedClientId || null,
        invoiceId: invoiceId || null,
        status: 'active',
      },
      include: {
        managedClient: true,
        invoice: true,
      },
    });

    // Create initial "installed" event
    await prisma.machineEvent.create({
      data: {
        machineId: machine.id,
        eventType: 'installed',
        notes: `Machine ${serialNumber} (${model}) registered`,
        toClientId: managedClientId || null,
        toAddress: [address, city, province, postalCode].filter(Boolean).join(', ') || null,
        toIp: ipAddress || null,
      },
    });

    // Link to Station via StationMachine if the caller supplied a stationId
    // (e.g. the /admin/stations hold-to-save flow). If no explicit stationId
    // was passed but we *do* have an invoiceId, derive the station from the
    // invoice — otherwise the Machines list loses track of the station.
    let linkedStationId: string | null =
      typeof stationId === 'string' && stationId.trim() ? stationId.trim() : null;
    if (!linkedStationId && machine.invoiceId) {
      const inv = await prisma.stationInvoice.findUnique({
        where: { id: machine.invoiceId },
        select: { stationId: true },
      });
      if (inv?.stationId) linkedStationId = inv.stationId;
    }
    if (linkedStationId) {
      const stationExists = await prisma.station.findUnique({
        where: { id: linkedStationId },
        select: { id: true },
      });
      if (stationExists) {
        const alreadyLinked = await prisma.stationMachine.findFirst({
          where: { stationId: linkedStationId, machineId: machine.id },
          select: { id: true },
        });
        if (!alreadyLinked) {
          await prisma.stationMachine.create({
            data: { stationId: linkedStationId, machineId: machine.id },
          });
        }
      }
    }

    return NextResponse.json({ machine }, { status: 201 });
  } catch (error) {
    console.error('Error creating machine:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
