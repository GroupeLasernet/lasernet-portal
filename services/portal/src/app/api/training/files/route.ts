import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// GET /api/training/files — list all files (optionally filtered by templateId or eventId)
export async function GET(request: NextRequest) {
  try {
    const templateId = request.nextUrl.searchParams.get('templateId') || undefined;
    const eventId = request.nextUrl.searchParams.get('eventId') || undefined;

    const where: any = {};
    if (templateId) where.templateId = templateId;
    if (eventId) where.eventId = eventId;

    const files = await db.trainingFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        fileType: true,
        fileSize: true,
        templateId: true,
        eventId: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ files });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/training/files — upload a file
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, fileType, fileData, fileSize, templateId, eventId } = body;
    if (!name || !fileData) return NextResponse.json({ error: 'Name and fileData are required' }, { status: 400 });

    const file = await db.trainingFile.create({
      data: {
        name,
        fileType: fileType || 'other',
        fileData,
        fileSize: fileSize || null,
        templateId: templateId || null,
        eventId: eventId || null,
      },
    });
    return NextResponse.json({
      file: { id: file.id, name: file.name, fileType: file.fileType, fileSize: file.fileSize, createdAt: file.createdAt },
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
