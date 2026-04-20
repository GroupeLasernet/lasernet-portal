// ============================================================
// handles.ts — computes human-readable identifiers for the
// People tab so Claude and Hugo can reference individuals
// unambiguously in chat.
// ------------------------------------------------------------
// CONVENTION (set by Hugo 2026-04-19)
//   Prisma Staff  → "@firstnamelastinitial"   e.g. "@hugob"   (@ at FRONT)
//   Client Staff  → "firstnamelastinitial@companyslug"        (@ in MIDDLE)
//                                             e.g. "ben@abc"
//
//   Leads are written "firstnamelastinitial@lead" until they
//   convert into a Contact or User with a real company slug.
//
//   Handles are DERIVED, not persisted — so if a name changes
//   the handle changes automatically, and no migration is needed.
//
// NOTE: we deliberately avoid Unicode property escapes (\p{L}\p{N})
// and the /u flag because Next.js 14's TS target (es5-ish) rejects
// them at compile time. Instead we NFD-normalize + strip combining
// marks to reduce accented letters to ASCII, then match on a plain
// ASCII class. This handles French names (é, è, ç, ô…) correctly.
// ============================================================

/** Strip diacritics so "Hugo Bergeron" and "Hugó Bergerón" both map to ASCII. */
function asciiFold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** "Hugo Bergeron" → "hugob" (first name + first letter of last name, lowercased) */
export function personSlug(fullName: string): string {
  const parts = asciiFold(fullName)
    .trim()
    .replace(/[^a-zA-Z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0].toLowerCase();
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0]!.toLowerCase() : '';
  return `${first}${lastInitial}`;
}

/**
 * "Atelier DSM Inc." → "atelierdsm"
 * "ABC Entreprise"   → "abc"
 * Strips punctuation + common company suffixes so the slug is short and stable.
 */
export function companySlug(company: string | null | undefined): string {
  if (!company) return '';
  const suffixRe = /\b(inc|ltd|ltee|llc|corp|corporation|sa|srl|gmbh|co|company|entreprise|enterprise|group|groupe)\b\.?/gi;
  return asciiFold(company)
    .replace(suffixRe, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('')
    .toLowerCase()
    .slice(0, 20); // keep it short so handles stay scannable
}

/** Prisma Staff handle → "@hugob" */
export function prismaHandle(fullName: string): string {
  const slug = personSlug(fullName);
  return slug ? `@${slug}` : '';
}

/** Client Staff handle → "ben@abc" */
export function clientHandle(fullName: string, company: string | null | undefined): string {
  const p = personSlug(fullName);
  const c = companySlug(company);
  if (!p) return '';
  if (!c) return `${p}@`;
  return `${p}@${c}`;
}

/** Lead handle → "ben@lead" (until the lead becomes a Contact or User) */
export function leadHandle(fullName: string, company?: string | null): string {
  // If a lead already has a company attached, use it — nicer to read than "@lead"
  const c = companySlug(company);
  const p = personSlug(fullName);
  if (!p) return '';
  return c ? `${p}@${c}` : `${p}@lead`;
}
