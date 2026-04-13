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

export function LanguageProvider({ children, initialLang = 'fr' }: { children: ReactNode; initialLang?: Language }) {
  const [lang, setLangState] = useState<Language>(initialLang);

  // On mount, check if there's a saved language preference
  useEffect(() => {
    // Try to get from the auth endpoint (user's DB preference)
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.user?.language && (data.user.language === 'fr' || data.user.language === 'en')) {
          setLangState(data.user.language);
        }
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback(async (newLang: Language) => {
    setLangState(newLang);
    // Persist to DB
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
