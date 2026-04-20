// ============================================================
// /api/admin/team
// GET  — list all admins (active + invited)
// POST — invite a new admin (any admin can invite)
// Requires caller to be an active admin.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { generateInviteToken } from '@/lib/password';
import { sendAdminInviteEmail } from '@/lib/email';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const admins = await prisma.user.findMany({
    where: { role: 'admin' },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      subrole: true,
      status: true,
      company: true,
      phone: true,
      photo: true,
      createdAt: true,
      inviteExpiresAt: true,
      accessAlways: true,
      accessTimeFrom: true,
      accessTimeTo: true,
      accessDays: true,
      accessDateFrom: true,
      accessDateTo: true,
    },
  });

  return NextResponse.json({ admins });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = (body?.email || '').trim().toLowerCase();
  const name = (body?.name || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  const inviteToken = generateInviteToken();
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

  let user;
  if (existing) {
    // Re-invite: if the user exists but isn't active, refresh invite fields and promote to admin.
    if (existing.status === 'active' && existing.role === 'admin') {
      return NextResponse.json(
        { error: 'That user is already an active admin.' },
        { status: 409 }
      );
    }
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        role: 'admin',
        status: 'invited',
        inviteToken,
        inviteExpiresAt,
        // password left as-is — invitee will set one via accept-invite
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email,
        name,
        role: 'admin',
        status: 'invited',
        inviteToken,
        inviteExpiresAt,
      },
    });
  }

  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const inviteUrl = `${base.replace(/\/$/, '')}/accept-invite?token=${inviteToken}`;

  // Fire-and-await the email (so UI knows whether it went through).
  const emailSent = await sendAdminInviteEmail({
    to: user.email,
    name: user.name,
    inviteUrl,
    invitedBy: guard.user.name || guard.user.email || null,
  });

  return NextResponse.json({
    admin: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      inviteExpiresAt: user.inviteExpiresAt,
    },
    inviteUrl,
    emailSent,
  });
}
