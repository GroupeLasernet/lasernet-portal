'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { type Language, t as translate } from './translations';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (section: string, key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'fr',
  setLang: () => {},
  t: (_section, key) => key,
});

const STORAGE_KEY = 'lasernet.lang';

function readCachedLang(fallback: Language): Language {
  if (typeof window === 'undefined') return fallback;
  try {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (cached === 'fr' || cached === 'en') return cached;
  } catch {}
  return fallback;
}

export function LanguageProvider({ children, initialLang = 'fr' }: { children: ReactNode; initialLang?: Language }) {
  // Lazy init so the very first render on the client already uses the cached pref
  // (avoids a French flash when navigating or hard-reloading).
  const [lang, setLangState] = useState<Language>(() => readCachedLang(initialLang));

  // On mount, reconcile with the user's DB preference (source of truth across devices).
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        const dbLang = data?.user?.language;
        if (dbLang === 'fr' || dbLang === 'en') {
          setLangState(dbLang);
          try { window.localStorage.setItem(STORAGE_KEY, dbLang); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback(async (newLang: Language) => {
    setLangState(newLang);
    // Cache immediately so the next navigation/reload paints in the chosen language.
    try { window.localStorage.setItem(STORAGE_KEY, newLang); } catch {}
    // Persist to DB so the preference follows the user across devices.
    try {
      await fetch('/api/auth/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: newLang }),
      });
    } catch {
      // If not logged in, that's fine — language will be set on next login
    }
  }, []);

  const t = useCallback((section: string, key: string) => {
    return translate(section as any, key, lang);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export default LanguageContext;
