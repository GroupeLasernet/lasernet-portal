// ============================================================
// /api/leads/[id]/messages — GET (list) and POST (send)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  try {
    const messages = await prisma.leadMessage.findMany({
      where: { leadId: params.id },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { sentAt: 'asc' },
    });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('GET /api/leads/[id]/messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { content, subject } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  try {
    const message = await prisma.leadMessage.create({
      data: {
        leadId: params.id,
        senderId: guard.user.userId || guard.user.id,
        senderName: guard.user.name,
        senderEmail: guard.user.email,
        isFromClient: false,
        content: content.trim(),
        subject: subject || null,
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: params.id,
        actorId: guard.user.userId || guard.user.id,
        actorName: guard.user.name,
        type: 'message_sent',
        description: `Message sent${subject ? `: ${subject}` : ''}`,
      },
    });

    await prisma.lead.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('POST /api/leads/[id]/messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
