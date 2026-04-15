// ============================================================
// Station PC authentication — HMAC verification for inbound
// requests from the on-prem robot service (self-registration +
// heartbeat). Mirrors the signing scheme used outbound in
// /api/machines/license/[serial].
//
// Rollout posture:
//   - ROBOT_LICENSE_SECRET not set        → accept unsigned (warn in logs)
//   - ROBOT_LICENSE_SECRET set, LICENSE_STRICT != "true" → accept unsigned,
//                                                          verify when present
//   - ROBOT_LICENSE_SECRET set, LICENSE_STRICT == "true" → reject unsigned
// ============================================================
import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

export type VerifyResult =
  | { ok: true; signed: boolean; reason?: string }
  | { ok: false; status: number; reason: string };

// Timestamp must be within ±10 minutes of server time to block replays.
// Same tolerance as the license sync window.
const MAX_SKEW_MS = 10 * 60 * 1000;

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Verify the HMAC on an inbound station-PC request.
 *
 * Canonical is caller-supplied so each endpoint can include its own fields.
 * Recommended shape:
 *   `v1|<purpose>|<identifier>|<nonce>|<timestampISO>`
 *
 * Caller is responsible for extracting `purpose` + `identifier` from the body
 * and reconstructing the canonical string in the exact same order the PC used.
 */
export function verifyStationSignature(
  request: NextRequest,
  canonical: string,
  bodyTimestamp: string | undefined
): VerifyResult {
  const strict = process.env.LICENSE_STRICT === 'true';
  const secret = process.env.ROBOT_LICENSE_SECRET;
  const sigHeader = request.headers.get('x-station-signature') || '';

  if (!secret) {
    if (strict) {
      return { ok: false, status: 503, reason: 'server missing ROBOT_LICENSE_SECRET' };
    }
    console.warn('[stationAuth] ROBOT_LICENSE_SECRET not set — accepting unsigned');
    return { ok: true, signed: false, reason: 'no secret on server' };
  }

  if (!sigHeader) {
    if (strict) {
      return { ok: false, status: 401, reason: 'missing x-station-signature header' };
    }
    console.warn('[stationAuth] request has no signature — accepting (soft-pass)');
    return { ok: true, signed: false, reason: 'no signature, soft-pass' };
  }

  // Clock skew check — only enforced when a signature is present.
  if (bodyTimestamp) {
    const t = Date.parse(bodyTimestamp);
    if (!Number.isFinite(t)) {
      return { ok: false, status: 400, reason: 'invalid timestamp' };
    }
    if (Math.abs(Date.now() - t) > MAX_SKEW_MS) {
      return { ok: false, status: 401, reason: 'timestamp outside tolerance' };
    }
  }

  const expected = createHmac('sha256', secret).update(canonical).digest('hex');
  if (!safeEqualHex(sigHeader, expected)) {
    return { ok: false, status: 401, reason: 'signature mismatch' };
  }

  return { ok: true, signed: true };
}

/** Extract the caller IP from common proxy headers (Vercel sets x-forwarded-for). */
export function extractClientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return null;
}
