import { NextRequest, NextResponse } from 'next/server';
import { fetchEstimates, isConnected, getTokensFromDB } from '@/lib/quickbooks';
import { mockQuotes } from '@/lib/mock-data';

// GET /api/quickbooks/estimates?customerId=123
// Returns estimates/quotes from QuickBooks, or mock data if not connected
export async function GET(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get('customerId') || undefined;
    // DB is the sole source of truth for QB tokens (cookies removed 2026-04-13).
    const tokens = await getTokensFromDB();

    if (isConnected(tokens)) {
      const { estimates: qbEstimates } = await fetchEstimates(tokens!, customerId);

      const quotes = qbEstimates.map((est) => ({
        id: `q-${est.Id}`,
        quoteNumber: est.DocNumber || `QUO-${est.Id}`,
        clientId: est.CustomerRef?.value || '',
        clientName: est.CustomerRef?.name || '',
        amount: est.TotalAmt || 0,
        status: est.TxnStatus === 'Accepted' ? 'accepted' : est.TxnStatus === 'Closed' ? 'declined' : 'pending',
        date: est.TxnDate || '',
        validUntil: est.ExpirationDate || '',
        items: est.Line
          ?.filter((l) => l.DetailType === 'SalesItemLineDetail')
          .map((l) => ({
            description: l.Description || '',
            quantity: l.SalesItemLineDetail?.Qty || 1,
            rate: l.SalesItemLineDetail?.UnitPrice || l.Amount || 0,
            amount: l.Amount || 0,
          })) || [],
      }));

      return NextResponse.json({ quotes, source: 'quickbooks' });
    }

    return NextResponse.json({ quotes: mockQuotes, source: 'mock' });
  } catch (error: any) {
    console.error('Error fetching estimates:', error);
    return NextResponse.json({ quotes: mockQuotes, source: 'mock', error: error.message });
  }
}
