import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/projects/[id] — Get project with quotes + items
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const project = await prisma.leadProject.findUnique({
      where: { id },
      include: {
        quotes: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[id] — Update project name/status/notes
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name.trim();
    if (body.status !== undefined) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.callbackReason !== undefined) data.callbackReason = body.callbackReason || null;
    if (body.suggestedProducts !== undefined) data.suggestedProducts = body.suggestedProducts || null;
    if (body.objective !== undefined) data.objective = body.objective || null;
    if (body.budget !== undefined) data.budget = body.budget != null ? parseFloat(String(body.budget)) : null;

    // When refusing a project, mark all its quotes as "refused"
    if (body.refuseAllQuotes) {
      await prisma.quote.updateMany({
        where: { projectId: id },
        data: { status: 'refused' },
      });
    }

    const project = await prisma.leadProject.update({
      where: { id },
      data,
      include: {
        quotes: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[id] — Delete a project (cascades to quotes + items)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.leadProject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
