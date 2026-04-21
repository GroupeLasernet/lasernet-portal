// ============================================================
// lib/files/shared.ts
// ------------------------------------------------------------
// Shared building blocks for the /api/files/* service layer:
//   • ApiError — thrown by services, caught at the route edge
//     and translated into a NextResponse with the right status.
//   • AssetFilters — parsed query-string shape used by the
//     documents + videos GET handlers.
//   • parseAssetFilters — translates URLSearchParams into the
//     Prisma `where` object both routes need.
//   • includeForFileAsset / includeForVideoAsset — the recurring
//     `include` objects for the read queries.
//   • reshapeFileAsset / reshapeVideoAsset — flatten skuLinks
//     (and BigInt sizeBytes for files) into the JSON shape the
//     client expects.
// ============================================================

/**
 * Error thrown inside a service to short-circuit with a specific
 * HTTP status + message. Routes catch this at the edge.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Parsed filter set used by both documents + videos GET. */
export interface AssetFilters {
  scope?: string;
  managedClientId?: string;
  localBusinessId?: string;
  category?: string;
  folderId?: string;
}

/** Read the supported filter params off a URLSearchParams. */
export function parseAssetFilters(searchParams: URLSearchParams): AssetFilters {
  const filters: AssetFilters = {};
  const scope = searchParams.get('scope');
  const managedClientId = searchParams.get('managedClientId');
  const localBusinessId = searchParams.get('localBusinessId');
  const category = searchParams.get('category');
  const folderId = searchParams.get('folderId');
  if (scope) filters.scope = scope;
  if (managedClientId) filters.managedClientId = managedClientId;
  if (localBusinessId) filters.localBusinessId = localBusinessId;
  if (category) filters.category = category;
  if (folderId) filters.folderId = folderId;
  return filters;
}

/** Turn AssetFilters into a Prisma `where` object (same shape for files + videos). */
export function assetFiltersToWhere(filters: AssetFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.scope) where.scope = filters.scope;
  if (filters.managedClientId) where.managedClientId = filters.managedClientId;
  if (filters.localBusinessId) where.localBusinessId = filters.localBusinessId;
  if (filters.category) where.category = filters.category;
  if (filters.folderId) where.folderId = filters.folderId;
  return where;
}

/** include shape for reading a FileAsset row with joined labels + sku links. */
export const includeForFileAsset = {
  managedClient: { select: { id: true, displayName: true } },
  localBusiness: { select: { id: true, name: true } },
  skuLinks: { select: { skuId: true, skuName: true } },
} as const;

/** include shape for reading a VideoAsset row (same joins, different link table). */
export const includeForVideoAsset = {
  managedClient: { select: { id: true, displayName: true } },
  localBusiness: { select: { id: true, name: true } },
  skuLinks: { select: { skuId: true, skuName: true } },
} as const;

/** A FileAsset row with skuLinks joined — shape-matched to includeForFileAsset. */
interface FileAssetRowWithLinks {
  sizeBytes: bigint | number;
  skuLinks: Array<{ skuId: string; skuName: string | null }>;
  [key: string]: unknown;
}

/** A VideoAsset row with skuLinks joined — shape-matched to includeForVideoAsset. */
interface VideoAssetRowWithLinks {
  skuLinks: Array<{ skuId: string; skuName: string | null }>;
  [key: string]: unknown;
}

/**
 * Flatten a joined FileAsset row for JSON transport.
 * - BigInt sizeBytes → Number (JSON can't carry BigInt).
 * - skuLinks → skuIds + skus arrays (denormalized for the client).
 */
export function reshapeFileAsset<T extends FileAssetRowWithLinks>(row: T) {
  return {
    ...row,
    sizeBytes: Number(row.sizeBytes),
    skuIds: row.skuLinks.map((l) => l.skuId),
    skus: row.skuLinks.map((l) => ({ id: l.skuId, name: l.skuName })),
  };
}

/** Same reshaping for a VideoAsset row (no BigInt to convert). */
export function reshapeVideoAsset<T extends VideoAssetRowWithLinks>(row: T) {
  return {
    ...row,
    skuIds: row.skuLinks.map((l) => l.skuId),
    skus: row.skuLinks.map((l) => ({ id: l.skuId, name: l.skuName })),
  };
}

/**
 * Parse a body.skuIds / body.skuNames pair off a JSON body.
 * Returns null for skuIds when the key is absent or not an array
 * so PATCH callers can tell "don't touch sku links" from "empty set".
 */
export function parseSkuPayloadFromJson(body: Record<string, unknown>): {
  skuIds: string[] | null;
  skuNames: (string | null)[];
} {
  const skuIds = Array.isArray(body.skuIds)
    ? (body.skuIds as unknown[]).filter((s): s is string => typeof s === 'string')
    : null;
  const skuNames = Array.isArray(body.skuNames)
    ? (body.skuNames as unknown[]).map((n) => (typeof n === 'string' ? n : null))
    : [];
  return { skuIds, skuNames };
}

/**
 * Parse a multipart formData.skuIds / skuNames pair — both arrive
 * as JSON-encoded strings. Tolerates missing / malformed values
 * (same behavior as the pre-refactor inline parser).
 */
export function parseSkuPayloadFromForm(form: FormData): {
  skuIds: string[];
  skuNames: (string | null)[];
} {
  const skuIdsRaw = (form.get('skuIds') as string | null) || null;
  let skuIds: string[] = [];
  if (skuIdsRaw) {
    try {
      const parsed = JSON.parse(skuIdsRaw);
      if (Array.isArray(parsed)) skuIds = parsed.filter((s): s is string => typeof s === 'string');
    } catch {
      // tolerate bad json — just no skus
    }
  }
  const skuNamesRaw = (form.get('skuNames') as string | null) || null;
  let skuNames: (string | null)[] = [];
  if (skuNamesRaw) {
    try {
      const parsed = JSON.parse(skuNamesRaw);
      if (Array.isArray(parsed)) skuNames = parsed.map((n) => (typeof n === 'string' ? n : null));
    } catch {
      // ignore
    }
  }
  return { skuIds, skuNames };
}
