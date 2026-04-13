import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// GET /api/training/templates — list all templates
export async function GET() {
  try {
    const templates = await db.trainingTemplate.findMany({
      include: { files: true, events: { select: { id: true, title: true, date: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/training/templates — create a template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const template = await db.trainingTemplate.create({
      data: { name, description: description || null },
      include: { files: true },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
