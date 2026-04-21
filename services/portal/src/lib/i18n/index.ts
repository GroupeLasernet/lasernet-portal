// ============================================================
// i18n — merged translations object + `t()` helper.
// ------------------------------------------------------------
// Re-exported from src/lib/translations.ts for import-path
// backwards compatibility. Add a new namespace:
//   1. create `./<name>.ts` exporting `export const <name> = { ... }`
//   2. import + include it in the `translations` object below.
// ============================================================

import { common } from './common';
import { nav } from './nav';
import { login } from './login';
import { forgot } from './forgot';
import { dashboard } from './dashboard';
import { clients } from './clients';
import { stations } from './stations';
import { machines } from './machines';
import { trainingPage } from './trainingPage';
import { tickets } from './tickets';
import { files } from './files';
import { settings } from './settings';
import { stationPcs } from './stationPcs';
import { leads } from './leads';
import { emails } from './emails';
import { businesses } from './businesses';
import { liveVisits } from './liveVisits';

export type Language = 'fr' | 'en';

export const translations = {
  common,
  nav,
  login,
  forgot,
  dashboard,
  clients,
  stations,
  machines,
  trainingPage,
  tickets,
  files,
  settings,
  stationPcs,
  leads,
  emails,
  businesses,
  liveVisits,
} as const;

// Helper type for nested keys
type TranslationSection = typeof translations;
export type SectionKey = keyof TranslationSection;

// Get a translation value (section + key → localized string).
export function t(section: SectionKey, key: string, lang: Language): string {
  const sectionObj = translations[section] as Record<string, Record<Language, string>>;
  if (!sectionObj || !sectionObj[key]) return key;
  return sectionObj[key][lang] || sectionObj[key]['en'] || key;
}

export default translations;
