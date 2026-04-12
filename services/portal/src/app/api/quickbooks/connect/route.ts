import { NextResponse } from 'next/server';
import { getAuthorizationUrl, fetchDiscoveryDocument, validateCredentials } from '@/lib/quickbooks';

// GET /api/quickbooks/connect
// Fetches the Intuit discovery document and returns the authorization URL
export async function GET() {
  try {
    // First check that credentials are configured
    const { valid, missing } = validateCredentials();
    if (!valid) {
      return NextResponse.json(
        {
          error: 'QuickBooks credentials are not configured on the server.',
          details: `Missing environment variables: ${missing.join(', ')}. Please add them in Vercel → Settings → Environment Variables and redeploy.`,
        },
        { status: 500 }
      );
    }

    // Fetch discovery document to ensure we have the latest endpoints
    await fetchDiscoveryDocument();

    const authUrl = getAuthorizationUrl();

    // Verify the auth URL actually contains client_id
    if (!authUrl.includes('client_id=')) {
      return NextResponse.json(
        {
          error: 'Authorization URL was generated without client_id.',
          details: 'The intuit-oauth SDK did not include client_id in the URL. This may indicate the credentials are invalid or the SDK is not loading correctly.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('QuickBooks connect error:', error);
    return NextResponse.json(
      { error: 'Failed to generate auth URL.', details: error.message },
      { status: 500 }
    );
  }
}
