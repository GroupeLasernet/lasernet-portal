// ============================================================
// USERS STORE — Database-backed user storage
// Uses Prisma + PostgreSQL for persistent data
// ============================================================

import prisma from './prisma';

export type UserStatus = 'invited' | 'active';

export interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  role: 'client' | 'admin';
  company?: string | null;
  phone?: string | null;
  photo?: string | null;
  password?: string | null;
  status: UserStatus;
  inviteToken?: string | null;
  createdAt: string;
}

// Convert Prisma User to RegisteredUser interface
function toRegisteredUser(user: any): RegisteredUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'client' | 'admin',
    company: user.company,
    phone: user.phone,
    photo: user.photo,
    password: user.password,
    status: user.status as UserStatus,
    inviteToken: user.inviteToken,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function getUsers(): Promise<RegisteredUser[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return users.map(toRegisteredUser);
}

export async function getUserByEmail(email: string): Promise<RegisteredUser | null> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  return user ? toRegisteredUser(user) : null;
}

export async function createUser(
  data: Omit<RegisteredUser, 'id' | 'createdAt'>
): Promise<RegisteredUser> {
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role || 'client',
      company: data.company || null,
      phone: data.phone || null,
      photo: data.photo || null,
      password: data.password || null,
      status: data.status || 'invited',
      inviteToken: data.inviteToken || null,
    },
  });
  return toRegisteredUser(user);
}

export async function updateUser(
  email: string,
  updates: Partial<RegisteredUser>
): Promise<RegisteredUser | null> {
  try {
    // Find the user first (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!existing) return null;

    // Build update data, excluding immutable fields
    const { id, createdAt, email: _email, ...allowedUpdates } = updates as any;

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: allowedUpdates,
    });
    return toRegisteredUser(user);
  } catch {
    return null;
  }
}

export async function deleteUser(email: string): Promise<boolean> {
  try {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!existing) return false;

    await prisma.user.delete({ where: { id: existing.id } });
    return true;
  } catch {
    return false;
  }
}
