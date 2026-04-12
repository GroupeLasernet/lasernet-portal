// ============================================================
// AUTH UTILITIES
// Handles JWT token creation/verification
// User lookups are now database-backed via users.ts
// ============================================================

import { SignJWT, jwtVerify } from 'jose';

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
