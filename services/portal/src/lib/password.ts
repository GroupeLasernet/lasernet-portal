// ============================================================
// PASSWORD UTILITIES
// bcrypt hashing + verification with graceful legacy-plaintext fallback.
// A stored value beginning with "$2" is treated as a bcrypt hash;
// anything else is treated as legacy plaintext and rehashed on successful login.
// ============================================================

import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

export function isBcryptHash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
}

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Verify a submitted password against the value stored in the DB.
 * Returns one of:
 *  - { ok: false }
 *  - { ok: true, rehash: null }              stored is already bcrypt, nothing to do
 *  - { ok: true, rehash: "<new bcrypt hash>" }  caller should persist the new hash
 */
export async function verifyPassword(
  submitted: string,
  stored: string | null | undefined
): Promise<{ ok: boolean; rehash: string | null }> {
  if (!stored || !submitted) return { ok: false, rehash: null };

  if (isBcryptHash(stored)) {
    const ok = await bcrypt.compare(submitted, stored);
    return { ok, rehash: null };
  }

  // Legacy plaintext row. Fall back to equality, rehash on success.
  if (submitted === stored) {
    const rehash = await hashPassword(submitted);
    return { ok: true, rehash };
  }
  return { ok: false, rehash: null };
}

/** Cryptographically random URL-safe token for invite links. */
export function generateInviteToken(bytes = 32): string {
  // crypto is available globally in modern Node / the edge runtime.
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString('base64url');
}
