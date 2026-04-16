// ============================================================
// /api/quickbooks/accounts — GET
// Returns QB Chart of Accounts for dropdowns (Income, COGS, Asset)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { queryQuickBooks, isConnected, getTokensFromDB, saveTokensToDB } from '@/lib/quickbooks';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    const tokens = await getTokensFromDB();
    if (!isConnected(tokens)) {
      return NextResponse.json({ accounts: [], connected: false });
    }

    // Fetch active accounts — filter by type in the client
    const query = "SELECT * FROM Account WHERE Active = true MAXRESULTS 200";
    const { data, updatedTokens } = await queryQuickBooks(query, tokens!);
    if (updatedTokens) await saveTokensToDB(updatedTokens);

    const accounts = (data?.QueryResponse?.Account || []).map((a: any) => ({
      id: a.Id,
      name: a.Name,
      fullName: a.FullyQualifiedName || a.Name,
      type: a.AccountType,         // Income, Cost of Goods Sold, Other Current Asset, Expense, etc.
      subType: a.AccountSubType,   // SalesOfProductIncome, SuppliesMaterialsCogs, Inventory, etc.
      classification: a.Classification, // Revenue, Expense, Asset, etc.
    }));

    return NextResponse.json({ accounts, connected: true });
  } catch (error: any) {
    console.error('GET /api/quickbooks/accounts error:', error);
    const msg = error?.message || 'Failed to fetch accounts';
    return NextResponse.json({ error: msg, accounts: [] }, { status: 500 });
  }
}
