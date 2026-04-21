// ============================================================
// translations.ts — thin barrel over src/lib/i18n/.
// ------------------------------------------------------------
// The actual per-namespace modules live in ./i18n/. This file
// only exists so that existing imports like
//   import translations from '@/lib/translations';
//   import { t, Language } from '@/lib/translations';
// keep working while we migrate call sites to `@/lib/i18n`.
// ============================================================

export { translations, t } from './i18n';
export type { Language, SectionKey } from './i18n';

import translations from './i18n';
export default translations;
