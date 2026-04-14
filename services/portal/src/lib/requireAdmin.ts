// ============================================================
// REQUIRE ADMIN — route guard helper
// Reads the auth-token cookie, verifies the JWT, returns the
// decoded payload when the caller is an active admin.
// Returns a NextResponse (401/403) otherwise.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './auth';

export interface AdminPayload {
  userId?: string;
  id?: string;
  email: string;
  name: string;
  role: string;
}

export async function requireAdmin(
  request: NextRequest
): Promise<{ user: AdminPayload } | { error: NextResponse }> {
  const token = request.cookies.get('auth-token')?.value;
  if (!token) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  const payload = (await verifyToken(token)) as AdminPayload | null;
  if (!payload) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  if (payload.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 }) };
  }
  return { user: payload };
}
