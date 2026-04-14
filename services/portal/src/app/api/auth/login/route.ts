import { NextRequest, NextResponse } from 'next/server';
import { createToken } from '@/lib/auth';
import { getUserByEmail } from '@/lib/users';
import { verifyPassword } from '@/lib/password';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Look up user in database (admins, superadmins, and clients share this table).
    const user = await getUserByEmail(email);

    if (!user || user.status !== 'active' || !user.password) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const { ok, rehash } = await verifyPassword(password, user.password);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // If the stored password was legacy plaintext, transparently upgrade to bcrypt.
    if (rehash) {
      try {
        await prisma.user.update({ where: { id: user.id }, data: { password: rehash } });
      } catch (e) {
        console.warn('login: failed to rehash legacy password (non-fatal)', e);
      }
    }

    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'admin' | 'client',
      company: user.company,
      phone: user.phone,
      createdAt: user.createdAt,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
