import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { id: string };
}

// DELETE /api/managed-clients/[id] — Remove a managed client
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    await prisma.managedClient.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting managed client:', error);
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
}
