import { NextRequest, NextResponse } from 'next/server';
import { queryQuickBooks, isConnected, getTokensFromDB, saveTokensToDB } from '@/lib/quickbooks';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/quickbooks/inventory?type=Inventory&category=Manuals
// Returns items from QuickBooks (type = Inventory | NonInventory | Service | all)
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  try {
    const tokens = await getTokensFromDB();
    if (!isConnected(tokens)) {
      return NextResponse.json({ items: [], connected: false });
    }

    const typeFilter = request.nextUrl.searchParams.get('type') || 'all';
    const search = request.nextUrl.searchParams.get('q') || '';

    let query = 'SELECT * FROM Item WHERE Active = true';
    if (typeFilter !== 'all') {
      query += ` AND Type = '${typeFilter}'`;
    }
    if (search) {
      query += ` AND Name LIKE '%${search.replace(/'/g, "\\'")}%'`;
    }
    query += ' MAXRESULTS 500';

    const { data, updatedTokens } = await queryQuickBooks(query, tokens!);
    if (updatedTokens) await saveTokensToDB(updatedTokens);

    const items = (data?.QueryResponse?.Item || []).map((item: any) => ({
      id: item.Id,
      name: item.Name,
      fullName: item.FullyQualifiedName || item.Name,
      type: item.Type, // Inventory, NonInventory, Service, Category, etc.
      description: item.Description || null,
      unitPrice: item.UnitPrice || 0,
      qtyOnHand: item.QtyOnHand ?? null,
      sku: item.Sku || null,
      category: item.ParentRef?.name || null,
      active: item.Active,
    }));

    return NextResponse.json({ items, connected: true });
  } catch (error) {
    console.error('GET /api/quickbooks/inventory error:', error);
    // Still report connected status even when the query fails
    const tokens = await getTokensFromDB().catch(() => null);
    return NextResponse.json({ error: 'Failed to fetch inventory', items: [], connected: isConnected(tokens) }, { status: 500 });
  }
}
