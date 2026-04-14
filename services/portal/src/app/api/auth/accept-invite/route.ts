// ============================================================
// /api/auth/accept-invite
// POST — consume inviteToken, set password (bcrypt), flip status='active',
//        issue auth cookie so the user is logged in immediately.
// GET  — introspect a token (for the accept-invite page to show email/name).
// Public route (no auth required) — the token itself is the credential.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { createToken } from '@/lib/auth';

function isExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const user = await prisma.user.findFirst({
    where: { inviteToken: token },
    select: { email: true, name: true, role: true, inviteExpiresAt: true, status: true },
  });

  if (!user) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (isExpired(user.inviteExpiresAt)) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
  }

  // Active users reaching this page are using a password-reset link;
  // flag mode so the UI can show "Reset password" instead of "Accept invitation".
  const mode = user.status === 'active' ? 'reset' : 'invite';
  return NextResponse.json({
    invite: { email: user.email, name: user.name, role: user.role, mode },
  });
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = (body?.token || '').trim();
  const password = body?.password || '';

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    );
  }

  const user = await prisma.user.findFirst({ where: { inviteToken: token } });
  if (!user) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (isExpired(user.inviteExpiresAt)) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
  }

  const hashed = await hashPassword(password);

  // For invited users this both sets the password AND activates the account.
  // For active users (password-reset flow) it just rotates the password and clears the token.
  const activated = await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      status: 'active',
      inviteToken: null,
      inviteExpiresAt: null,
    },
  });

  const jwt = await createToken({
    id: activated.id,
    email: activated.email,
    name: activated.name,
    role: activated.role as 'admin' | 'client',
    company: activated.company,
    phone: activated.phone,
    createdAt: activated.createdAt.toISOString(),
  });

  const response = NextResponse.json({
    user: {
      id: activated.id,
      email: activated.email,
      name: activated.name,
      role: activated.role,
    },
  });

  response.cookies.set('auth-token', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8,
    path: '/',
  });

  return response;
}
