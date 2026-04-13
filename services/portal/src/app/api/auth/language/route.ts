import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST /api/auth/language — Update user's language preference
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const user = await verifyToken(token);
    if (!user?.id) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { language } = await request.json();
    if (language !== 'fr' && language !== 'en') {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id as string },
      data: { language },
    });

    return NextResponse.json({ success: true, language });
  } catch (error) {
    console.error('Language update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
