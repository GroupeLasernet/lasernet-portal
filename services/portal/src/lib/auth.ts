// ============================================================
// AUTH UTILITIES
// Handles JWT token creation/verification
// User lookups are now database-backed via users.ts
// ============================================================

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'lasernet-secret-change-this-in-production'
);

export type UserRole = 'admin' | 'client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  company?: string | null;
  phone?: string | null;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  createdAt: string;
}

export async function createToken(user: User): Promise<string> {
  return new SignJWT({ userId: user.id, email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<any | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// REQUIRE ADMIN — route guard helper
// Reads the auth-token cookie internally, verifies the JWT,
// returns the decoded user when the caller is an active admin.
// Returns a { error: NextResponse } on failure.
// ============================================================

export interface AdminGuardUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function requireAdmin(): Promise<
  { user: AdminGuardUser } | { error: NextResponse }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  const payload = await verifyToken(token);
  if (!payload) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  if (payload.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 }) };
  }
  return {
    user: {
      id: payload.userId || payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    },
  };
}
