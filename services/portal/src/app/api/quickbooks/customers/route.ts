import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCustomers, isConnected, getTokensFromCookies, buildTokenCookie, buildClearTokenCookie } from '@/lib/quickbooks';
import { mockQBClients } from '@/lib/mock-data';

// GET /api/quickbooks/customers
// Returns all customers from QuickBooks, or mock data if not connected
export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie');
    const tokens = getTokensFromCookies(cookieHeader);

    // If connected to QuickBooks, fetch real data
    if (isConnected(tokens)) {
      const { customers: qbCustomers, updatedTokens } = await fetchAllCustomers(tokens!);

      // Transform QB format to our app format
      const customers = qbCustomers.map((c) => ({
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

      const response = NextResponse.json({ customers, source: 'quickbooks' });

      // If tokens were refreshed, update the cookie
      if (updatedTokens) {
        response.headers.set('Set-Cookie', buildTokenCookie(updatedTokens));
      }

      return response;
    }

    // Not connected — return mock data
    return NextResponse.json({ customers: mockQBClients, source: 'mock' });
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    // Fall back to mock data on error and clear the stale token cookie
    const response = NextResponse.json({
      customers: mockQBClients,
      source: 'mock',
      error: error.message,
      expired: true,
    });
    response.headers.set('Set-Cookie', buildClearTokenCookie());
    return response;
  }
}
