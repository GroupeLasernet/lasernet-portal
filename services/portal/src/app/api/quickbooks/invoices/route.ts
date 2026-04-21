import { NextRequest, NextResponse } from 'next/server';
import { fetchInvoices, fetchAllCustomers, isConnected, getTokensFromDB, cacheQBData, getCachedInvoices } from '@/lib/quickbooks';
import { mockInvoices } from '@/lib/mock-data';

export const dynamic = 'force-dynamic';

function transformInvoices(qbInvoices: any[]) {
  return qbInvoices.map((inv) => ({
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
      ?.filter((l: any) => l.DetailType === 'SalesItemLineDetail')
      .map((l: any) => ({
        // itemId = QB Item.Id, matches FileAssetSku.skuId for the
        // "related files" chip on the line item row.
        itemId: l.SalesItemLineDetail?.ItemRef?.value || null,
        description: l.Description || '',
        model: l.SalesItemLineDetail?.ItemRef?.name || '',
        quantity: l.SalesItemLineDetail?.Qty || 1,
        rate: l.SalesItemLineDetail?.UnitPrice || l.Amount || 0,
        amount: l.Amount || 0,
      })) || [],
  }));
}

// GET /api/quickbooks/invoices?customerId=123
// Returns invoices from QuickBooks, or cached data, or mock data
export async function GET(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get('customerId') || undefined;
    // DB is the sole source of truth for QB tokens (cookies removed 2026-04-13).
    const tokens = await getTokensFromDB();

    if (isConnected(tokens)) {
      const { invoices: qbInvoices } = await fetchInvoices(tokens!, customerId);

      // Cache all invoices + customers in background on every successful fetch
      if (!customerId) {
        // Only cache when fetching ALL invoices (not filtered)
        try {
          const { customers: qbCustomers } = await fetchAllCustomers(tokens!);
          cacheQBData(qbInvoices, qbCustomers); // fire-and-forget
        } catch {
          // Just cache invoices with empty customers if customer fetch fails
          cacheQBData(qbInvoices, []);
        }
      }

      const invoices = transformInvoices(qbInvoices);
      return NextResponse.json({ invoices, source: 'quickbooks' });
    }

    // Not connected — try cache before falling back to mock
    const cachedInvoices = await getCachedInvoices();
    if (cachedInvoices && cachedInvoices.length > 0) {
      let filtered = cachedInvoices;
      if (customerId) {
        filtered = cachedInvoices.filter((inv) => inv.CustomerRef?.value === customerId);
      }
      const invoices = transformInvoices(filtered);
      return NextResponse.json({ invoices, source: 'cache' });
    }

    return NextResponse.json({ invoices: mockInvoices, source: 'mock' });
  } catch (error: any) {
    console.error('Error fetching invoices:', error);

    // Try cache on error
    const cachedInvoices = await getCachedInvoices();
    if (cachedInvoices && cachedInvoices.length > 0) {
      const invoices = transformInvoices(cachedInvoices);
      return NextResponse.json({ invoices, source: 'cache', error: error.message });
    }

    return NextResponse.json({ invoices: mockInvoices, source: 'mock', error: error.message });
  }
}
