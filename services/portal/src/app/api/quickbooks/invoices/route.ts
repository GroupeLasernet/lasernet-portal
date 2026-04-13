import { NextRequest, NextResponse } from 'next/server';
import { fetchInvoices, isConnected, getTokensFromCookies, getTokensFromDB, buildTokenCookie } from '@/lib/quickbooks';
import { mockInvoices } from '@/lib/mock-data';

export const dynamic = 'force-dynamic';

// GET /api/quickbooks/invoices?customerId=123
// Returns invoices from QuickBooks, or mock data if not connected
export async function GET(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get('customerId') || undefined;
    // Try DB first, fall back to cookies
    const cookieHeader = request.headers.get('cookie');
    const tokens = await getTokensFromDB() || getTokensFromCookies(cookieHeader);

    if (isConnected(tokens)) {
      const { invoices: qbInvoices, updatedTokens } = await fetchInvoices(tokens!, customerId);

      const invoices = qbInvoices.map((inv) => ({
        id: `inv-${inv.Id}`,
        invoiceNumber: inv.DocNumber || `INV-${inv.Id}`,
        clientId: inv.CustomerRef?.value || '',
        clientName: inv.CustomerRef?.name || '',
        amount: inv.TotalAmt || 0,
        balance: inv.Balance || 0,
        status: inv.Balance === 0 ? 'paid' : (new Date(inv.DueDate) < new Date() ? 'overdue' : 'unpaid'),
        date: inv.TxnDate || '',
        dueDate: inv.DueDate || '',
        items: inv.Line
          ?.filter((l) => l.DetailType === 'SalesItemLineDetail')
          .map((l) => ({
            description: l.Description || '',
            quantity: l.SalesItemLineDetail?.Qty || 1,
            rate: l.SalesItemLineDetail?.UnitPrice || l.Amount || 0,
            amount: l.Amount || 0,
          })) || [],
      }));

      const response = NextResponse.json({ invoices, source: 'quickbooks' });
      if (updatedTokens) {
        response.headers.set('Set-Cookie', buildTokenCookie(updatedTokens));
      }
      return response;
    }

    return NextResponse.json({ invoices: mockInvoices, source: 'mock' });
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ invoices: mockInvoices, source: 'mock', error: error.message });
  }
}
