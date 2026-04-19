import { NextRequest, NextResponse } from 'next/server';
import { handleCallback, buildClearLegacyCookie, fetchInvoices, fetchAllCustomers, cacheQBData } from '@/lib/quickbooks';

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

    // Tokens are now persisted in Postgres by handleCallback(). We still
    // clear any legacy `qb_tokens` cookie so admin browsers don't carry
    // stale data from before the DB-only migration.
    void tokens; // tokens already saved; retained for clarity
    const response = NextResponse.redirect(
      new URL('/admin/businesses?qb=connected', request.url)
    );
    response.headers.set('Set-Cookie', buildClearLegacyCookie());

    return response;
  } catch (error: any) {
    console.error('QuickBooks callback error:', error);
    return NextResponse.redirect(
      new URL(
        '/admin/businesses?qb=error&message=' + encodeURIComponent(error.message),
        request.url
      )
    );
  }
}
