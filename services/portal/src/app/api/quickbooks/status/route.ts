import { NextRequest, NextResponse } from 'next/server';
import { isConnected, getTokensFromCookies, validateCredentials } from '@/lib/quickbooks';

// GET /api/quickbooks/status
// Check if QuickBooks is connected and credentials are configured
export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie');
  const tokens = getTokensFromCookies(cookieHeader);
  const connected = isConnected(tokens);
  const { valid: credentialsConfigured, missing } = validateCredentials();

  return NextResponse.json({
    connected,
    realmId: tokens?.realmId || null,
    credentialsConfigured,
    missingCredentials: missing,
  });
}
