import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyStationSignature, extractClientIp } from '@/lib/stationAuth';

// POST /api/station-pcs/[id]/heartbeat
// Called by the on-prem robot service every ~5 minutes to report liveness
// and software versions. The PC sends its stored id (returned by /register)
// plus current `robotVersion` + `relfarVersion` strings.
//
// Canonical signing string:
//   "v1|heartbeat|<pcId>|<nonce>|<timestampISO>"
//
// Side-effects:
//   - lastHeartbeatAt ← now()
//   - lastHeartbeatIp ← request IP
//   - robotVersion + relfarVersion updated if provided
//   - status transitions:
//       provisioning → online (only if approved=true)
//       offline      → online
//       retired      → unchanged (retired is a terminal state)
//
// Unapproved PCs still have their heartbeat accepted (so operators can see
// versions + IP when reviewing) but are never auto-promoted to `online`.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      robotVersion,
      relfarVersion,
      nonce,
      timestamp,
    }: {
      robotVersion?: unknown;
      relfarVersion?: unknown;
      nonce?: unknown;
      timestamp?: unknown;
    } = body;

    const canonical = [
      'v1',
      'heartbeat',
      id,
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

    const existing = await prisma.stationPC.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Station PC not found' }, { status: 404 });
    }

    const ip = extractClientIp(request);

    // Decide next status.
    let nextStatus = existing.status;
    if (existing.status === 'retired') {
      nextStatus = 'retired';
    } else if (existing.approved) {
      nextStatus = 'online';
    } else {
      // Unapproved — keep it visible as "provisioning" regardless of liveness.
      nextStatus = 'provisioning';
    }

    const updated = await prisma.stationPC.update({
      where: { id },
      data: {
        lastHeartbeatAt: new Date(),
        lastHeartbeatIp: ip,
        robotVersion:
          typeof robotVersion === 'string' && robotVersion.trim()
            ? robotVersion.trim()
            : existing.robotVersion,
        relfarVersion:
          typeof relfarVersion === 'string' && relfarVersion.trim()
            ? relfarVersion.trim()
            : existing.relfarVersion,
        status: nextStatus,
      },
    });

    return NextResponse.json({
      ok: true,
      id: updated.id,
      status: updated.status,
      approved: updated.approved,
      signed: verify.signed,
    });
  } catch (error) {
    console.error('Error processing station PC heartbeat:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
