import { NextRequest, NextResponse } from 'next/server';
import { handleCallback, buildTokenCookie, fetchInvoices, fetchAllCustomers, cacheQBData } from '@/lib/quickbooks';

// GET /api/quickbooks/callback
// QuickBooks redirects here after the admin authorizes access
export async function GET(request: NextRequest) {
  try {
    const url = request.url;
    const tokens = await handleCallback(url);

    // Cache all QB data immediately on successful connection
    try {
      const [{ invoices }, { customers }] = await Promise.all([
        fetchInvoices(tokens),
        fetchAllCustomers(tokens),
      ]);
      await cacheQBData(invoices, customers);
    } catch (cacheErr) {
      console.error('Failed to cache QB data on callback:', cacheErr);
    }

    // Redirect back to the admin clients page and set the token cookie
    const response = NextResponse.redirect(
      new URL('/admin/clients?qb=connected', request.url)
    );
    response.headers.set('Set-Cookie', buildTokenCookie(tokens));

    return response;
  } catch (error: any) {
    console.error('QuickBooks callback error:', error);
    return NextResponse.redirect(
      new URL(
        '/admin/clients?qb=error&message=' + encodeURIComponent(error.message),
        request.url
      )
    );
  }
}
