import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
}

// GET /api/stations/[id]/invoices — List invoices for a station
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;

    // Verify station exists
    const station = await prisma.station.findUnique({
      where: { id },
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const invoices = await prisma.stationInvoice.findMany({
      where: { stationId: id },
      orderBy: { linkedAt: 'desc' },
    });

    const result = invoices.map((inv) => ({
      id: inv.id,
      qbInvoiceId: inv.qbInvoiceId,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      amount: inv.amount,
      lineItems: inv.lineItemsJson ? JSON.parse(inv.lineItemsJson) : null,
      linkedAt: inv.linkedAt.toISOString(),
    }));

    return NextResponse.json({ invoices: result });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

// POST /api/stations/[id]/invoices — Link an invoice to a station
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { qbInvoiceId, invoiceNumber, invoiceType, amount, lineItems } = body;

    if (!qbInvoiceId || !invoiceNumber) {
      return NextResponse.json(
        { error: 'qbInvoiceId and invoiceNumber are required' },
        { status: 400 }
      );
    }

    // Verify station exists
    const station = await prisma.station.findUnique({
      where: { id },
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    await prisma.stationInvoice.create({
      data: {
        stationId: id,
        qbInvoiceId,
        invoiceNumber,
        invoiceType: invoiceType || 'general',
        amount: amount || null,
        lineItemsJson: lineItems ? JSON.stringify(lineItems) : null,
      },
    });

    // Return the full updated station so the frontend can replace its state.
    const updatedStation = await prisma.station.findUnique({
      where: { id },
      include: {
        managedClient: true,
        invoices: { orderBy: { linkedAt: 'desc' } },
        machines: { include: { machine: true } },
      },
    });

    return NextResponse.json({ station: updatedStation }, { status: 201 });
  } catch (error) {
    console.error('Error linking invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
