import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET + POST /api/cleanup-duplicate-contacts — Find duplicate emails and delete all but the newest
// This is a one-time cleanup route. Remove after use.
export async function GET() { return cleanup(); }
export async function POST() { return cleanup(); }

async function cleanup() {
  try {
    // Find all contacts grouped by email, keep only the most recent one
    const allContacts = await prisma.contact.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const seenEmails = new Map<string, string>(); // email -> kept contact id
    const toDelete: string[] = [];

    for (const contact of allContacts) {
      const emailLower = contact.email.toLowerCase();
      if (seenEmails.has(emailLower)) {
        toDelete.push(contact.id);
      } else {
        seenEmails.set(emailLower, contact.id);
      }
    }

    if (toDelete.length > 0) {
      await prisma.contact.deleteMany({
        where: { id: { in: toDelete } },
      });
    }

    return NextResponse.json({
      message: `Cleaned up ${toDelete.length} duplicate contact(s)`,
      deletedIds: toDelete,
      totalRemaining: allContacts.length - toDelete.length,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
