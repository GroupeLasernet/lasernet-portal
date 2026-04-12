import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
}

// GET /api/jobs/[id]/invoices — List invoices for a job
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const invoices = await prisma.jobInvoice.findMany({
      where: { jobId: id },
      orderBy: { linkedAt: 'desc' },
    });

    const result = invoices.map((inv) => ({
      id: inv.id,
      qbInvoiceId: inv.qbInvoiceId,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      amount: inv.amount,
      linkedAt: inv.linkedAt.toISOString(),
    }));

    return NextResponse.json({ invoices: result });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/jobs/[id]/invoices — Link an invoice to a job
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { qbInvoiceId, invoiceNumber, invoiceType, amount } = body;

    if (!qbInvoiceId || !invoiceNumber) {
      return NextResponse.json(
        { error: 'qbInvoiceId and invoiceNumber are required' },
        { status: 400 }
      );
    }

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const invoice = await prisma.jobInvoice.create({
      data: {
        jobId: id,
        qbInvoiceId,
        invoiceNumber,
        invoiceType: invoiceType || 'general',
        amount: amount || null,
      },
    });

    const result = {
      id: invoice.id,
      qbInvoiceId: invoice.qbInvoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      amount: invoice.amount,
      linkedAt: invoice.linkedAt.toISOString(),
    };

    return NextResponse.json({ invoice: result }, { status: 201 });
  } catch (error) {
    console.error('Error linking invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
