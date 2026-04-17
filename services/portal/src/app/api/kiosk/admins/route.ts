import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/kiosk/admins — Public endpoint returning admin names for the
// "Meeting with" dropdown on the kiosk. No auth required (kiosk is public).
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ admins: users });
  } catch (error) {
    console.error('Error fetching admins for kiosk:', error);
    return NextResponse.json({ admins: [] });
  }
}

export const dynamic = 'force-dynamic';
