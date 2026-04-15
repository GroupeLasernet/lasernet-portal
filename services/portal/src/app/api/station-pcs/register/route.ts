import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyStationSignature, extractClientIp } from '@/lib/stationAuth';

// POST /api/station-pcs/register
// Called by the on-prem robot service on first boot (and on every boot —
// idempotent). The PC detects its own serial + MAC + hostname and sends them
// here. The server finds-or-creates a StationPC row keyed on serial, then on
// MAC as a fallback, and returns the row id so the PC can store it locally
// and reference it in subsequent heartbeats.
//
// Rollout: signed with HMAC-SHA256(ROBOT_LICENSE_SECRET, canonical) where
//   canonical = "v1|register|<serial>|<macAddress or 'null'>|<nonce>|<timestampISO>"
// Signature travels in header `x-station-signature`. See lib/stationAuth.ts
// for the soft-pass / strict-mode gating.
//
// PCs created via this endpoint start with approved=false (quarantine) so
// an operator can review before the PC can be assigned to a Station.
//
// Response shape:
//   { id, approved, status, serial, macAddress, hostname }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      serial,
      macAddress,
      hostname,
      nonce,
      timestamp,
    }: {
      serial?: unknown;
      macAddress?: unknown;
      hostname?: unknown;
      nonce?: unknown;
      timestamp?: unknown;
    } = body;

    if (typeof serial !== 'string' || !serial.trim()) {
      return NextResponse.json({ error: 'serial is required' }, { status: 400 });
    }
    const s = serial.trim();
    const mac =
      typeof macAddress === 'string' && macAddress.trim()
        ? macAddress.trim().toLowerCase()
        : null;
    const hn = typeof hostname === 'string' && hostname.trim() ? hostname.trim() : null;

    // Verify signature (or accept unsigned in soft-pass mode).
    const canonical = [
      'v1',
      'register',
      s,
      mac ?? 'null',
      typeof nonce === 'string' ? nonce : '',
      typeof timestamp === 'string' ? timestamp : '',
    ].join('|');
    const verify = verifyStationSignature(
      request,
      canonical,
      typeof timestamp === 'string' ? timestamp : undefined
    );
    if (!verify.ok) {
      return NextResponse.json({ error: verify.reason }, { status: verify.status });
    }

    // Find-or-create: serial first, then MAC as fallback.
    let pc = await prisma.stationPC.findUnique({ where: { serial: s } });
    if (!pc && mac) {
      pc = await prisma.stationPC.findUnique({ where: { macAddress: mac } });
    }

    const ip = extractClientIp(request);

    if (pc) {
      // Known PC — update whatever the agent told us about itself, but never
      // flip `approved` back to false once an operator has approved it, and
      // never overwrite a nickname an operator may have set.
      pc = await prisma.stationPC.update({
        where: { id: pc.id },
        data: {
          // Update serial if we matched on MAC and the PC's serial changed
          // (e.g. motherboard swap reusing the NIC). Rare, but keeps identity
          // tracking sane.
          serial: s,
          macAddress: mac ?? pc.macAddress,
          hostname: hn ?? pc.hostname,
          lastHeartbeatAt: new Date(),
          lastHeartbeatIp: ip,
          // On re-register, if we had a PC marked offline/provisioning, put it
          // back in provisioning until the first proper heartbeat promotes it.
          status: pc.status === 'retired' ? 'retired' : pc.status,
        },
      });
    } else {
      // Brand-new PC — create quarantined.
      pc = await prisma.stationPC.create({
        data: {
          serial: s,
          macAddress: mac,
          hostname: hn,
          status: 'provisioning',
          approved: false,
          lastHeartbeatAt: new Date(),
          lastHeartbeatIp: ip,
        },
      });
    }

    return NextResponse.json(
      {
        id: pc.id,
        serial: pc.serial,
        macAddress: pc.macAddress,
        hostname: pc.hostname,
        status: pc.status,
        approved: pc.approved,
        signed: verify.signed,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error registering station PC:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
