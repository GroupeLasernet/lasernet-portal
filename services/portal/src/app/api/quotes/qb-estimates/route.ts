import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromDB, fetchEstimates } from '@/lib/quickbooks';

// GET /api/quotes/qb-estimates?customerId=xxx
// Fetch estimates from QuickBooks for a given customer
export async function GET(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get('customerId') || undefined;

    const tokens = await getTokensFromDB();
    if (!tokens) {
      return NextResponse.json({ estimates: [], error: 'QuickBooks not connected' });
    }

    const { estimates } = await fetchEstimates(tokens, customerId);
    return NextResponse.json({ estimates });
  } catch (error: any) {
    console.error('Error fetching QB estimates:', error);
    return NextResponse.json({ estimates: [], error: error.message });
  }
}
