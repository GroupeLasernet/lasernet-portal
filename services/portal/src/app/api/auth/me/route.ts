import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  // Fetch fresh language preference from DB
  let language = 'fr';
  if (user.id) {
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id as string }, select: { language: true } });
      if (dbUser?.language) language = dbUser.language;
    } catch { /* fallback to fr */ }
  }
  return NextResponse.json({ user: { ...user, language } });
}
