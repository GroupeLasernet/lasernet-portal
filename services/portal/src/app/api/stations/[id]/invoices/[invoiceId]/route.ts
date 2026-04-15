import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  id: string;
  invoiceId: string;
}

// DELETE /api/stations/[id]/invoices/[invoiceId] — Unlink an invoice from a
// station AND authoritatively clean up the station's notes JSON so the UI
// (items count, machine cards, linkedInvoices chips) reflects reality in a
// single atomic round-trip. Previously the frontend did a two-step
// DELETE-then-PATCH dance where the PATCH was best-effort; a silent failure
// there (or a legacy station with untagged items / orphan tags from earlier
// buggy removals) left ghost machines and a stale "From invoice" caption.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const { id, invoiceId } = params;

    // Verify invoice exists and belongs to this station
    const invoice = await prisma.stationInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || invoice.stationId !== id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Grab the station + all its remaining invoices up front so we can
    // reconcile notes AFTER the DB row is deleted.
    const station = await prisma.station.findUnique({
      where: { id },
      include: { invoices: true },
    });
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    await prisma.stationInvoice.delete({ where: { id: invoiceId } });

    // Build the canonical "still linked" set from what SURVIVED in the DB
    // (i.e. everything except the one we just deleted).
    const survivors = station.invoices.filter((inv) => inv.id !== invoiceId);
    const survivingQbIds = new Set(survivors.map((inv) => inv.qbInvoiceId));
    const survivingNumbers = new Set(survivors.map((inv) => inv.invoiceNumber));

    // Parse notes, reconcile, write back.
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(station.notes || '{}');
    } catch {
      meta = {};
    }

    type Item = {
      sourceInvoiceId?: string;
      sourceInvoiceNumber?: string;
      [k: string]: unknown;
    };
    const items: Item[] = Array.isArray(meta.items) ? (meta.items as Item[]) : [];
    const rawMachineData = Array.isArray(meta.machineData)
      ? (meta.machineData as Record<string, unknown>[])
      : [];

    const removedIsPrimary =
      meta.invoiceNumber === invoice.invoiceNumber ||
      meta.invoiceId === invoice.qbInvoiceId;

    // Decide which items to keep. Three rules, in order:
    //   1. If item is tagged with the invoice we just removed → drop.
    //   2. If item is tagged with an invoice that no longer has a
    //      surviving StationInvoice row → drop (orphan from a prior
    //      buggy removal). This is the self-heal path for legacy data.
    //   3. If item is untagged AND the removed invoice was primary →
    //      drop (untagged items are implicitly owned by the primary).
    //      Otherwise keep.
    const keepIndices: number[] = [];
    items.forEach((it, idx) => {
      const taggedWithRemoved =
        it.sourceInvoiceId === invoice.qbInvoiceId ||
        it.sourceInvoiceNumber === invoice.invoiceNumber;
      if (taggedWithRemoved) return;

      const hasTag = !!(it.sourceInvoiceId || it.sourceInvoiceNumber);
      if (hasTag) {
        const tagStillLinked =
          (it.sourceInvoiceId && survivingQbIds.has(it.sourceInvoiceId)) ||
          (it.sourceInvoiceNumber &&
            survivingNumbers.has(it.sourceInvoiceNumber));
        if (!tagStillLinked) return; // orphan, drop
      } else if (removedIsPrimary) {
        return; // untagged, primary went away, drop
      }

      keepIndices.push(idx);
    });

    const keptItems = keepIndices.map((i) => items[i]);
    // Keep machineData aligned to items by index. Any machineData slot
    // beyond the items array is pruned — otherwise later "add invoice"
    // stacks new items on top of orphan machineData entries and the card
    // grid looks off-by-N.
    const keptMachineData = keepIndices.map((i) => rawMachineData[i] ?? {});

    // Rewrite legacy notes.invoices array so it only contains invoices that
    // still have a DB row (or legacy entries we have no way to verify —
    // those get kept only if they aren't the one we just removed).
    const legacyInvoices: { id: string; number: string }[] = Array.isArray(
      meta.invoices
    )
      ? (meta.invoices as { id: string; number: string }[]).filter(
          (x) => x.id !== invoice.qbInvoiceId && x.number !== invoice.invoiceNumber
        )
      : [];

    // Promote a new primary if we just removed the old one.
    if (removedIsPrimary) {
      if (survivors.length > 0) {
        meta.invoiceId = survivors[0].qbInvoiceId;
        meta.invoiceNumber = survivors[0].invoiceNumber;
      } else if (legacyInvoices.length > 0) {
        meta.invoiceId = legacyInvoices[0].id;
        meta.invoiceNumber = legacyInvoices[0].number;
      } else {
        delete meta.invoiceId;
        delete meta.invoiceNumber;
      }
    }

    meta.invoices = legacyInvoices;
    meta.items = keptItems;
    meta.machineData = keptMachineData;

    await prisma.station.update({
      where: { id },
      data: { notes: JSON.stringify(meta) },
    });

    return NextResponse.json(
      {
        message: 'Invoice unlinked successfully',
        removedItems: items.length - keptItems.length,
        remainingInvoices: survivors.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error unlinking invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
