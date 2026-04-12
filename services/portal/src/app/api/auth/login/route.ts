import { NextRequest, NextResponse } from 'next/server';
import { createToken } from '@/lib/auth';
import { getUserByEmail } from '@/lib/users';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Look up user in database (handles both admins and clients)
    const user = await getUserByEmail(email);

    if (
      user &&
      user.password &&
      user.password === password &&
      user.status === 'active'
    ) {
      // Create JWT token
      const token = await createToken({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as 'admin' | 'client',
        company: user.company,
        phone: user.phone,
        createdAt: user.createdAt,
      });

      // Set cookie and return user info
      const response = NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });

      response.cookies.set('auth-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 8, // 8 hours
        path: '/',
      });

      return response;
    }

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
