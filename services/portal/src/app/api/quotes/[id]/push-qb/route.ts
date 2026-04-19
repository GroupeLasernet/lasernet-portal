import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokensFromDB, createEstimate, fetchTaxCodes } from '@/lib/quickbooks';

// POST /api/quotes/[id]/push-qb — Push a quote to QuickBooks as an Estimate
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: params.id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        project: {
          include: {
            lead: {
              select: {
                managedClient: {
                  select: {
                    qbId: true,
                    displayName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Need a QB customer reference
    const qbCustomerId = quote.project.lead.managedClient?.qbId;
    if (!qbCustomerId) {
      return NextResponse.json(
        { error: 'This quote\'s lead is not linked to a QuickBooks customer. Link a business first.' },
        { status: 400 },
      );
    }

    const tokens = await getTokensFromDB();
    if (!tokens) {
      return NextResponse.json({ error: 'QuickBooks is not connected' }, { status: 400 });
    }

    // Pull tax codes so we can translate our stored code id/name → QB TaxCode id
    const { taxCodes } = await fetchTaxCodes(tokens);
    const codeLookup = new Map<string, string>(); // stored value → QB TaxCode.Id
    for (const tc of taxCodes) {
      codeLookup.set(tc.Id, tc.Id);
      if (tc.Name) codeLookup.set(tc.Name, tc.Id);
    }

    // Build QB Estimate line items
    const lines = quote.items.map((item) => {
      const line: any = {
        Description: item.description,
        Amount: item.quantity * item.unitPrice,
        DetailType: 'SalesItemLineDetail' as const,
        SalesItemLineDetail: {
          Qty: item.quantity,
          UnitPrice: item.unitPrice,
        },
      };
      // Attach tax code if we can match it
      if (item.taxCode) {
        const qbTaxId = codeLookup.get(item.taxCode);
        if (qbTaxId) {
          line.SalesItemLineDetail.TaxCodeRef = { value: qbTaxId };
        }
      }
      // Service date on the line
      if (item.serviceDate) {
        line.SalesItemLineDetail.ServiceDate = item.serviceDate.toISOString().split('T')[0];
      }
      return line;
    });

    const estimatePayload: any = {
      CustomerRef: { value: qbCustomerId },
      Line: lines,
      TxnDate: new Date().toISOString().split('T')[0],
      // Amounts are recorded tax-excluded by default; QB applies tax from TaxCodeRef
      GlobalTaxCalculation: 'TaxExcluded',
    };

    if (quote.quoteNumber) estimatePayload.DocNumber = quote.quoteNumber;
    if (quote.expiresAt) estimatePayload.ExpirationDate = quote.expiresAt.toISOString().split('T')[0];
    if (quote.quoteMessage) {
      estimatePayload.CustomerMemo = { value: quote.quoteMessage };
    }

    const { estimate } = await createEstimate(estimatePayload, tokens);

    // Save QB reference back to our quote
    await prisma.quote.update({
      where: { id: params.id },
      data: {
        qbEstimateId: estimate.Id,
        qbSyncedAt: new Date(),
        status: quote.status === 'draft' ? 'pending' : quote.status,
      },
    });

    return NextResponse.json({ estimate, qbEstimateId: estimate.Id });
  } catch (error: any) {
    console.error('Error pushing quote to QB:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to push to QuickBooks' },
      { status: 500 },
    );
  }
}
