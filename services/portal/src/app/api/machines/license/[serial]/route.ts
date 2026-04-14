import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/machines/license/[serial]
// Called by the on-prem robot FastAPI service every ~15 minutes to sync
// its local license state. Must be fast + stateless.
//
// Response shape — the robot expects exactly these three fields:
//   { licenseMode, expiresAt, killSwitchActive }
// All other fields are ignored by the robot.
//
// Note: this endpoint is intentionally unauthenticated today — the
// Cloudflare Tunnel + Cloudflare Access service-token policy (§7) gates
// who can reach the robot, and the robot→portal direction will be
// tightened once the tunnel is in place. For now, do NOT include any
// sensitive data in the response; license state is only mildly sensitive.
export async function GET(
  _req: NextRequest,
  { params }: { params: { serial: string } }
) {
  try {
    const { serial } = params;
    if (!serial) {
      return NextResponse.json({ error: 'serial required' }, { status: 400 });
    }

    const machine = await prisma.machine.findUnique({
      where: { serialNumber: serial },
      select: {
        licenseMode: true,
        expiresAt: true,
        killSwitchActive: true,
      },
    });

    if (!machine) {
      // Unknown serial — treat as unlicensed so the robot refuses operation
      // under strict mode but admins can still see the state.
      return NextResponse.json(
        {
          licenseMode: 'unlicensed',
          expiresAt: null,
          killSwitchActive: false,
          warning: 'serial not registered in portal',
        },
        { status: 200 }
      );
    }

    // Record the time this robot last checked in (best effort, non-blocking).
    prisma.machine
      .update({
        where: { serialNumber: serial },
        data: { licenseLastCheckedAt: new Date() },
      })
      .catch((err) => console.error('licenseLastCheckedAt update failed', err));

    return NextResponse.json({
      licenseMode: machine.licenseMode,
      expiresAt: machine.expiresAt ? machine.expiresAt.toISOString() : null,
      killSwitchActive: machine.killSwitchActive,
    });
  } catch (error) {
    console.error('license lookup failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/machines/license/[serial]
// Admin-only endpoint to update license state. Called by the portal admin UI.
// Body: { licenseMode?, expiresAt?, killSwitchActive? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { serial: string } }
) {
  try {
    const { serial } = params;
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.licenseMode === 'string') {
      const allowed = ['unlicensed', 'sold', 'rented', 'killed'];
      if (!allowed.includes(body.licenseMode)) {
        return NextResponse.json(
          { error: `licenseMode must be one of ${allowed.join(', ')}` },
          { status: 400 }
        );
      }
      data.licenseMode = body.licenseMode;
    }

    if ('expiresAt' in body) {
      data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    }

    if (typeof body.killSwitchActive === 'boolean') {
      data.killSwitchActive = body.killSwitchActive;
    }

    const machine = await prisma.machine.update({
      where: { serialNumber: serial },
      data,
      select: {
        id: true,
        serialNumber: true,
        licenseMode: true,
        expiresAt: true,
        killSwitchActive: true,
        licenseLastCheckedAt: true,
      },
    });

    return NextResponse.json({ machine });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'P2025') {
      return NextResponse.json({ error: 'machine not found' }, { status: 404 });
    }
    console.error('license update failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
