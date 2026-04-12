import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
  invoiceId: string;
}

// DELETE /api/jobs/[id]/invoices/[invoiceId] — Unlink an invoice from a job
export async function DELETE(
  request: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const { id, invoiceId } = params;

    // Verify invoice exists and belongs to this job
    const invoice = await prisma.jobInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || invoice.jobId !== id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await prisma.jobInvoice.delete({
      where: { id: invoiceId },
    });

    return NextResponse.json({ message: 'Invoice unlinked successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error unlinking invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
