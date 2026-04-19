import { NextResponse } from 'next/server';
import { getTokensFromDB, fetchTaxCodes, fetchTaxRates } from '@/lib/quickbooks';

// GET /api/quotes/qb-tax-codes
// Returns QB tax codes with their resolved rates so the UI can display
// e.g. "TPS/TVQ QC - 9,975 (14,975 %)" with real percentages from QB.
export async function GET() {
  try {
    const tokens = await getTokensFromDB();
    if (!tokens) {
      return NextResponse.json({ taxCodes: [], error: 'QuickBooks not connected' });
    }

    const [{ taxCodes }, { taxRates }] = await Promise.all([
      fetchTaxCodes(tokens),
      fetchTaxRates(tokens),
    ]);

    // Build a rateId → percentage lookup
    const rateMap: Record<string, number> = {};
    for (const r of taxRates) {
      rateMap[r.Id] = r.RateValue;
    }

    // Enrich tax codes with computed total rate
    const enriched = taxCodes.map((tc) => {
      let totalRate = 0;
      const rateDetails: { name: string; rate: number }[] = [];

      if (tc.SalesTaxRateList?.TaxRateDetail) {
        for (const detail of tc.SalesTaxRateList.TaxRateDetail) {
          const pct = rateMap[detail.TaxRateRef.value] ?? 0;
          totalRate += pct;
          rateDetails.push({ name: detail.TaxRateRef.name, rate: pct });
        }
      }

      return {
        id: tc.Id,
        name: tc.Name,
        description: tc.Description,
        taxable: tc.Taxable,
        totalRate,
        rateDetails,
      };
    });

    return NextResponse.json({ taxCodes: enriched });
  } catch (error: any) {
    console.error('Error fetching QB tax codes:', error);
    return NextResponse.json({ taxCodes: [], error: error.message });
  }
}
