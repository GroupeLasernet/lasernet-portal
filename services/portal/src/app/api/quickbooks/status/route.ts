import { NextResponse } from 'next/server';
import { isConnected, getTokensFromDB, validateCredentials } from '@/lib/quickbooks';

// GET /api/quickbooks/status
// Check if QuickBooks is connected and credentials are configured
export async function GET() {
  // DB is the sole source of truth for QB tokens (cookies removed 2026-04-13)
  const tokens = await getTokensFromDB();
  const connected = isConnected(tokens);
  const { valid: credentialsConfigured, missing } = validateCredentials();

  return NextResponse.json({
    connected,
    realmId: tokens?.realmId || null,
    credentialsConfigured,
    missingCredentials: missing,
  });
}
