// ============================================================
// ACTOR HELPER
// Best-effort decode of the `auth-token` cookie to tag audit-trail rows
// with who performed an action. Never throws — a missing/invalid token
// just yields { email: null, name: null } so callers can still write the
// audit row without gating behaviour on it.
// ============================================================

import { NextRequest } from 'next/server';
import { verifyToken } from './auth';

export interface Actor {
  email: string | null;
  name: string | null;
}

export async function getActorFromRequest(request: NextRequest): Promise<Actor> {
  const token = request.cookies.get('auth-token')?.value;
  if (!token) return { email: null, name: null };
  try {
    const payload = (await verifyToken(token)) as
      | { email?: string; name?: string }
      | null;
    if (!payload) return { email: null, name: null };
    return {
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  } catch {
    return { email: null, name: null };
  }
}
