import { NextRequest, NextResponse } from 'next/server';
import { fetchEstimates, isConnected, getTokensFromCookies, getTokensFromDB, buildTokenCookie } from '@/lib/quickbooks';
import { mockQuotes } from '@/lib/mock-data';

// GET /api/quickbooks/estimates?customerId=123
// Returns estimates/quotes from QuickBooks, or mock data if not connected
export async function GET(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get('customerId') || undefined;
    // Try DB first, fall back to cookies
    const cookieHeader = request.headers.get('cookie');
    const tokens = await getTokensFromDB() || getTokensFromCookies(cookieHeader);

    if (isConnected(tokens)) {
      const { estimates: qbEstimates, updatedTokens } = await fetchEstimates(tokens!, customerId);

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

      const response = NextResponse.json({ quotes, source: 'quickbooks' });
      if (updatedTokens) {
        response.headers.set('Set-Cookie', buildTokenCookie(updatedTokens));
      }
      return response;
    }

    return NextResponse.json({ quotes: mockQuotes, source: 'mock' });
  } catch (error: any) {
    console.error('Error fetching estimates:', error);
    return NextResponse.json({ quotes: mockQuotes, source: 'mock', error: error.message });
  }
}
