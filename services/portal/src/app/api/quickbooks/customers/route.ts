import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCustomers, fetchInvoices, isConnected, getTokensFromCookies, getTokensFromDB, buildTokenCookie, buildClearTokenCookie, clearTokensFromDB, cacheQBData, getCachedCustomers } from '@/lib/quickbooks';
import { mockQBClients } from '@/lib/mock-data';

function transformCustomers(qbCustomers: any[]) {
  return qbCustomers.map((c) => ({
    id: `qb-${c.Id}`,
    displayName: c.DisplayName || '',
    companyName: c.CompanyName || c.DisplayName || '',
    email: c.PrimaryEmailAddr?.Address || '',
    phone: c.PrimaryPhone?.FreeFormNumber || '',
    address: c.BillAddr?.Line1 || '',
    city: c.BillAddr?.City || '',
    province: c.BillAddr?.CountrySubDivisionCode || '',
    postalCode: c.BillAddr?.PostalCode || '',
  }));
}

// GET /api/quickbooks/customers
// Returns all customers from QuickBooks, or cached data, or mock data
export async function GET(request: NextRequest) {
  try {
    // Try DB first, fall back to cookies
    const cookieHeader = request.headers.get('cookie');
    const tokens = await getTokensFromDB() || getTokensFromCookies(cookieHeader);

    // If connected to QuickBooks, fetch real data
    if (isConnected(tokens)) {
      const { customers: qbCustomers, updatedTokens } = await fetchAllCustomers(tokens!);

      // Cache customers + invoices in background on every successful fetch
      try {
        const { invoices: qbInvoices } = await fetchInvoices(tokens!);
        cacheQBData(qbInvoices, qbCustomers); // fire-and-forget
      } catch {
        cacheQBData([], qbCustomers);
      }

      const customers = transformCustomers(qbCustomers);
      const response = NextResponse.json({ customers, source: 'quickbooks' });

      if (updatedTokens) {
        response.headers.set('Set-Cookie', buildTokenCookie(updatedTokens));
      }
      return response;
    }

    // Not connected — try cache before falling back to mock
    const cachedCustomers = await getCachedCustomers();
    if (cachedCustomers && cachedCustomers.length > 0) {
      const customers = transformCustomers(cachedCustomers);
      return NextResponse.json({ customers, source: 'cache' });
    }

    return NextResponse.json({ customers: mockQBClients, source: 'mock' });
  } catch (error: any) {
    console.error('Error fetching customers:', error);

    // Try cache on error before falling back to mock
    const cachedCustomers = await getCachedCustomers();
    if (cachedCustomers && cachedCustomers.length > 0) {
      const customers = transformCustomers(cachedCustomers);
      return NextResponse.json({ customers, source: 'cache', error: error.message });
    }

    const response = NextResponse.json({
      customers: mockQBClients,
      source: 'mock',
      error: error.message,
      expired: true,
    });
    response.headers.set('Set-Cookie', buildClearTokenCookie());
    await clearTokensFromDB();
    return response;
  }
}
