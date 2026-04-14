import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import prisma from '@/lib/prisma';

// Canonical signing string for license responses. The robot recomputes the
// exact same string on its side and verifies the HMAC matches before
// trusting licenseMode / expiresAt / killSwitchActive.
//
// Scheme: "v1|<serial>|<licenseMode>|<expiresAtISO or 'null'>|<killSwitch 0/1>|<signedAtISO>"
// HMAC:   HMAC-SHA256(ROBOT_LICENSE_SECRET, canonical) → hex
//
// The "v1" prefix lets us bump the scheme in the future without breaking older
// robots — we can accept v1 OR v2 signatures for a window.
function signLicense(
  serial: string,
  licenseMode: string,
  expiresAt: string | null,
  killSwitchActive: boolean,
  signedAt: string
): { signature: string; signedAt: string } | null {
  const secret = process.env.ROBOT_LICENSE_SECRET;
  if (!secret) {
    // Don't error out — sign-as-best-effort lets us stage the rollout.
    // Admins will see a warning in logs until the env var is set.
    console.warn('[license] ROBOT_LICENSE_SECRET not set — response is unsigned');
    return null;
  }
  const canonical = [
    'v1',
    serial,
    licenseMode,
    expiresAt ?? 'null',
    killSwitchActive ? '1' : '0',
    signedAt,
  ].join('|');
  const signature = createHmac('sha256', secret).update(canonical).digest('hex');
  return { signature, signedAt };
}

// GET /api/machines/license/[serial]
// Called by the on-prem robot FastAPI service every ~15 minutes to sync
// its local license state. Must be fast + stateless.
//
// Response shape — the robot expects these fields:
//   { licenseMode, expiresAt, killSwitchActive, signedAt?, signature? }
// When ROBOT_LICENSE_SECRET is set, signedAt + signature are included and
// the robot MUST verify them before acting on the response. If the env var
// is not set, the response is unsigned (rollout-friendly degrade path).
//
// Note: this endpoint is intentionally unauthenticated at the transport
// layer today — the Cloudflare Tunnel + Cloudflare Access service-token
// policy (§7) will gate who can reach the robot, and the HMAC on the
// response closes the MITM gap for the robot→portal heartbeat direction.
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

    const signedAt = new Date().toISOString();

    if (!machine) {
      // Unknown serial — treat as unlicensed so the robot refuses operation
      // under strict mode but admins can still see the state. Sign it too
      // so a MITM can't forge a "licensed" response for an unknown serial.
      const sig = signLicense(serial, 'unlicensed', null, false, signedAt);
      return NextResponse.json(
        {
          licenseMode: 'unlicensed',
          expiresAt: null,
          killSwitchActive: false,
          warning: 'serial not registered in portal',
          ...(sig && { signedAt: sig.signedAt, signature: sig.signature }),
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

    const expiresAtIso = machine.expiresAt ? machine.expiresAt.toISOString() : null;
    const sig = signLicense(
      serial,
      machine.licenseMode,
      expiresAtIso,
      machine.killSwitchActive,
      signedAt
    );

    return NextResponse.json({
      licenseMode: machine.licenseMode,
      expiresAt: expiresAtIso,
      killSwitchActive: machine.killSwitchActive,
      ...(sig && { signedAt: sig.signedAt, signature: sig.signature }),
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
