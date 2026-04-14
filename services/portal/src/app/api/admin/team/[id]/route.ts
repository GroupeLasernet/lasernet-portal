// ============================================================
// /api/admin/team/[id]
// PATCH  — update an admin (status, name, or resend invite)
// DELETE — remove an admin (or demote to client)
//
// Guards:
//   - Caller must be an active admin.
//   - Caller cannot deactivate/remove themselves.
//   - System must always keep at least one active admin.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { generateInviteToken } from '@/lib/password';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

async function countActiveAdminsExcluding(excludeId: string): Promise<number> {
  return prisma.user.count({
    where: { role: 'admin', status: 'active', NOT: { id: excludeId } },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;
  const callerId = (guard.user.userId || guard.user.id)!;
  const targetId = params.id;

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: any = {};
  let newInviteUrl: string | null = null;

  // Field: name
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }

  // Field: status  ('active' | 'disabled')
  if (body.status === 'active' || body.status === 'disabled') {
    if (body.status === 'disabled') {
      if (targetId === callerId) {
        return NextResponse.json(
          { error: "You can't deactivate your own account." },
          { status: 400 }
        );
      }
      if (target.role === 'admin' && target.status === 'active') {
        const remaining = await countActiveAdminsExcluding(targetId);
        if (remaining < 1) {
          return NextResponse.json(
            { error: 'At least one active admin must remain.' },
            { status: 400 }
          );
        }
      }
    }
    updates.status = body.status;
  }

  // Action: resend invite (fresh token + expiry)
  if (body.resendInvite === true) {
    if (target.status === 'active') {
      return NextResponse.json(
        { error: 'User is already active — no invite to resend.' },
        { status: 400 }
      );
    }
    updates.inviteToken = generateInviteToken();
    updates.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    updates.status = 'invited';
    const base =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    newInviteUrl = `${base.replace(/\/$/, '')}/accept-invite?token=${updates.inviteToken}`;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: updates,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      inviteExpiresAt: true,
    },
  });

  return NextResponse.json({ admin: updated, inviteUrl: newInviteUrl });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;
  const callerId = (guard.user.userId || guard.user.id)!;
  const targetId = params.id;

  if (targetId === callerId) {
    return NextResponse.json(
      { error: "You can't remove your own account." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

  if (target.role === 'admin' && target.status === 'active') {
    const remaining = await countActiveAdminsExcluding(targetId);
    if (remaining < 1) {
      return NextResponse.json(
        { error: 'At least one active admin must remain.' },
        { status: 400 }
      );
    }
  }

  // Hard delete. If the target has tickets/relations that block delete,
  // flip them to role='client'+status='disabled' as a fallback.
  try {
    await prisma.user.delete({ where: { id: targetId } });
  } catch {
    await prisma.user.update({
      where: { id: targetId },
      data: { role: 'client', status: 'disabled', inviteToken: null, inviteExpiresAt: null },
    });
  }

  return NextResponse.json({ ok: true });
}
