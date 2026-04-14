import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
  invoiceId: string;
}

// DELETE /api/stations/[id]/invoices/[invoiceId] — Unlink an invoice from a station
export async function DELETE(
  request: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const { id, invoiceId } = params;

    // Verify invoice exists and belongs to this station
    const invoice = await prisma.stationInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || invoice.stationId !== id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await prisma.stationInvoice.delete({
      where: { id: invoiceId },
    });

    return NextResponse.json({ message: 'Invoice unlinked successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error unlinking invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
