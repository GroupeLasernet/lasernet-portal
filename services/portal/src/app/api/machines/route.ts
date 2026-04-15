import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
          include: { station: true },
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

    return NextResponse.json({ machine }, { status: 201 });
  } catch (error) {
    console.error('Error creating machine:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
