// ============================================================
// /api/kiosk/businesses — GET (public, no auth)
// Search businesses for kiosk autocomplete.
// Searches both ManagedClient (QB) and LocalBusiness tables.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim() || '';
  const domain = searchParams.get('domain')?.trim().toLowerCase() || '';

  if (!q && !domain) {
    return NextResponse.json({ results: [] });
  }

  // Minimum length checks
  if (q && q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  if (domain && domain.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    type Result = { id: string; name: string; email: string | null; type: 'managed' | 'local' };
    const results: Result[] = [];

    if (domain) {
      // Domain search — match the part after @ in email fields
      const domainPattern = `@${domain}`;

      const [managedClients, localBusinesses] = await Promise.all([
        prisma.managedClient.findMany({
          where: {
            email: { contains: domainPattern, mode: 'insensitive' },
          },
          take: 5,
          select: { id: true, companyName: true, displayName: true, email: true },
        }),
        prisma.localBusiness.findMany({
          where: {
            email: { contains: domainPattern, mode: 'insensitive' },
          },
          take: 5,
          select: { id: true, name: true, email: true },
        }),
      ]);

      for (const mc of managedClients) {
        results.push({
          id: mc.id,
          name: mc.companyName || mc.displayName,
          email: mc.email,
          type: 'managed',
        });
      }
      for (const lb of localBusinesses) {
        results.push({
          id: lb.id,
          name: lb.name,
          email: lb.email,
          type: 'local',
        });
      }
    } else {
      // Company name search
      const [managedClients, localBusinesses] = await Promise.all([
        prisma.managedClient.findMany({
          where: {
            OR: [
              { companyName: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 5,
          select: { id: true, companyName: true, displayName: true, email: true },
        }),
        prisma.localBusiness.findMany({
          where: {
            name: { contains: q, mode: 'insensitive' },
          },
          take: 5,
          select: { id: true, name: true, email: true },
        }),
      ]);

      for (const mc of managedClients) {
        results.push({
          id: mc.id,
          name: mc.companyName || mc.displayName,
          email: mc.email,
          type: 'managed',
        });
      }
      for (const lb of localBusinesses) {
        results.push({
          id: lb.id,
          name: lb.name,
          email: lb.email,
          type: 'local',
        });
      }
    }

    // Return max 5 results total
    return NextResponse.json({ results: results.slice(0, 5) });
  } catch (error) {
    console.error('GET /api/kiosk/businesses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
