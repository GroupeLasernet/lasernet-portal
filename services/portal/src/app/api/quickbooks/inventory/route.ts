import { NextRequest, NextResponse } from 'next/server';
import { queryQuickBooks, createQBEntity, isConnected, getTokensFromDB, saveTokensToDB } from '@/lib/quickbooks';
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
  } catch (error: any) {
    console.error('GET /api/quickbooks/inventory error:', error);
    const tokens = await getTokensFromDB().catch(() => null);
    const msg = error?.message || 'Failed to fetch inventory';
    return NextResponse.json({ error: msg, items: [], connected: isConnected(tokens) }, { status: 500 });
  }
}

// POST /api/quickbooks/inventory — Create item in QuickBooks
// QuickBooks Item fields by type:
//   ALL types: Name (required), Type (required), Description, UnitPrice, IncomeAccountRef
//   Inventory only: TrackQtyOnHand=true, QtyOnHand, InvStartDate, Sku, AssetAccountRef, ExpenseAccountRef (COGS)
//   NonInventory: ExpenseAccountRef (optional)
//   Service: ExpenseAccountRef (optional)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    name,
    type,            // 'Inventory' | 'NonInventory' | 'Service'
    description,
    unitPrice,
    purchaseCost,
    sku,
    qtyOnHand,
    incomeAccountId,
    expenseAccountId,
    assetAccountId,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (!type || !['Inventory', 'NonInventory', 'Service'].includes(type)) {
    return NextResponse.json({ error: 'Type must be Inventory, NonInventory, or Service' }, { status: 400 });
  }

  // Inventory items require income, expense (COGS), and asset accounts
  if (type === 'Inventory') {
    if (!incomeAccountId) return NextResponse.json({ error: 'Income account is required for Inventory items' }, { status: 400 });
    if (!expenseAccountId) return NextResponse.json({ error: 'COGS/Expense account is required for Inventory items' }, { status: 400 });
    if (!assetAccountId) return NextResponse.json({ error: 'Asset account is required for Inventory items' }, { status: 400 });
  }

  try {
    const tokens = await getTokensFromDB();
    if (!isConnected(tokens)) {
      return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 400 });
    }

    // Build the QB Item object
    const qbItem: Record<string, any> = {
      Name: name.trim(),
      Type: type,
    };

    if (description) qbItem.Description = description;
    if (unitPrice !== undefined && unitPrice !== null) qbItem.UnitPrice = Number(unitPrice);
    if (sku) qbItem.Sku = sku;

    // Income account (where revenue goes when sold)
    if (incomeAccountId) {
      qbItem.IncomeAccountRef = { value: incomeAccountId };
    }

    // Expense / COGS account
    if (expenseAccountId) {
      qbItem.ExpenseAccountRef = { value: expenseAccountId };
    }

    // Purchase cost (what it costs to buy)
    if (purchaseCost !== undefined && purchaseCost !== null) {
      qbItem.PurchaseCost = Number(purchaseCost);
    }

    // Inventory-specific fields
    if (type === 'Inventory') {
      qbItem.TrackQtyOnHand = true;
      qbItem.QtyOnHand = qtyOnHand !== undefined && qtyOnHand !== null ? Number(qtyOnHand) : 0;
      qbItem.InvStartDate = new Date().toISOString().split('T')[0]; // today
      if (assetAccountId) {
        qbItem.AssetAccountRef = { value: assetAccountId };
      }
    }

    const { data, updatedTokens } = await createQBEntity('item', qbItem, tokens!);
    if (updatedTokens) await saveTokensToDB(updatedTokens);

    const created = data?.Item || data;
    return NextResponse.json({
      item: {
        id: created.Id,
        name: created.Name,
        type: created.Type,
        description: created.Description || null,
        unitPrice: created.UnitPrice || 0,
        qtyOnHand: created.QtyOnHand ?? null,
        sku: created.Sku || null,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/quickbooks/inventory error:', error);
    // Try to extract QB validation errors for helpful feedback
    const msg = error?.message || 'Failed to create item';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
