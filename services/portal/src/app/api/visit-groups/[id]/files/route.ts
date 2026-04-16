// ============================================================
// /api/visit-groups/[id]/files — GET (list) and POST (upload)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    const visitGroup = await prisma.visitGroup.findUnique({ where: { id: params.id } });
    if (!visitGroup) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });
    }

    const files = await prisma.visitFile.findMany({
      where: { visitGroupId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error('GET /api/visit-groups/[id]/files error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { fileName, fileType, fileData, fileSize, notes } = body;

  if (!fileName || !fileType || !fileData) {
    return NextResponse.json(
      { error: 'fileName, fileType, and fileData are required' },
      { status: 400 }
    );
  }

  try {
    const visitGroup = await prisma.visitGroup.findUnique({ where: { id: params.id } });
    if (!visitGroup) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 });
    }

    const file = await prisma.visitFile.create({
      data: {
        visitGroupId: params.id,
        fileName,
        fileType,
        fileData,
        fileSize: fileSize ? parseInt(String(fileSize), 10) : null,
        uploadedById: guard.user.id,
        notes: notes || null,
      },
    });

    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    console.error('POST /api/visit-groups/[id]/files error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
