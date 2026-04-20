// ============================================================
// /api/admin/team/[id]
// GET    — fetch a single user by id (admin OR client role).
//          The People tab drawer hits this for any user row,
//          not just admins, so the endpoint must not role-gate
//          the RESULT — only the caller must be admin.
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
import { sendAdminInviteEmail, sendPasswordResetEmail } from '@/lib/email';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

async function countActiveAdminsExcluding(excludeId: string): Promise<number> {
  return prisma.user.count({
    where: { role: 'admin', status: 'active', NOT: { id: excludeId } },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
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

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user });
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
  let emailSent: boolean | null = null;
  let action: 'resendInvite' | 'resetPassword' | null = null;

  // Field: name
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }

  // Field: email
  if (typeof body.email === 'string' && body.email.trim()) {
    updates.email = body.email.trim().toLowerCase();
  }

  // Field: phone — nullable
  if (body.phone !== undefined) {
    updates.phone = (typeof body.phone === 'string' && body.phone.trim()) ? body.phone.trim() : null;
  }

  // Field: company — nullable (used by client-role users in People drawer)
  if (body.company !== undefined) {
    updates.company = (typeof body.company === 'string' && body.company.trim()) ? body.company.trim() : null;
  }

  // Field: subrole — restricted set
  if (body.subrole !== undefined) {
    const allowed = ['sales', 'support', 'technician'];
    updates.subrole = body.subrole && allowed.includes(body.subrole) ? body.subrole : null;
  }

  // Field: photo — base64 data URL (or null to clear)
  if (body.photo !== undefined) {
    updates.photo = (typeof body.photo === 'string' && body.photo.trim()) ? body.photo : null;
  }

  // Access schedule fields
  if (body.accessAlways !== undefined) {
    updates.accessAlways = Boolean(body.accessAlways);
  }
  if (body.accessTimeFrom !== undefined) {
    updates.accessTimeFrom = body.accessTimeFrom || null;
  }
  if (body.accessTimeTo !== undefined) {
    updates.accessTimeTo = body.accessTimeTo || null;
  }
  if (body.accessDays !== undefined) {
    updates.accessDays = body.accessDays ? JSON.stringify(body.accessDays) : null;
  }
  if (body.accessDateFrom !== undefined) {
    updates.accessDateFrom = body.accessDateFrom ? new Date(body.accessDateFrom) : null;
  }
  if (body.accessDateTo !== undefined) {
    updates.accessDateTo = body.accessDateTo ? new Date(body.accessDateTo) : null;
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

  // Action: resend invite (fresh token + expiry) — only for non-active users.
  if (body.resendInvite === true) {
    if (target.status === 'active') {
      return NextResponse.json(
        { error: 'User is already active — use "Reset password" instead.' },
        { status: 400 }
      );
    }
    updates.inviteToken = generateInviteToken();
    updates.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    updates.status = 'invited';
    action = 'resendInvite';
    const base =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    newInviteUrl = `${base.replace(/\/$/, '')}/accept-invite?token=${updates.inviteToken}`;
  }

  // Action: reset password — active user, emails a fresh token to let them pick a new password.
  // We keep status='active' so their current password still works until they set a new one.
  if (body.resetPassword === true) {
    if (target.status !== 'active') {
      return NextResponse.json(
        { error: 'User is not active — use "Send invite again" instead.' },
        { status: 400 }
      );
    }
    updates.inviteToken = generateInviteToken();
    updates.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    // status stays 'active'
    action = 'resetPassword';
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
      accessAlways: true,
      accessTimeFrom: true,
      accessTimeTo: true,
      accessDays: true,
      accessDateFrom: true,
      accessDateTo: true,
    },
  });

  // Send the corresponding email after the DB write succeeds.
  if (action && newInviteUrl) {
    const actorLabel = guard.user.name || guard.user.email || null;
    if (action === 'resendInvite') {
      emailSent = await sendAdminInviteEmail({
        to: updated.email,
        name: updated.name,
        inviteUrl: newInviteUrl,
        invitedBy: actorLabel,
      });
    } else {
      emailSent = await sendPasswordResetEmail({
        to: updated.email,
        name: updated.name,
        resetUrl: newInviteUrl,
        resetBy: actorLabel,
      });
    }
  }

  return NextResponse.json({ admin: updated, inviteUrl: newInviteUrl, emailSent });
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
