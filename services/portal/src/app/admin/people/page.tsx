'use client';

import { useLanguage } from '@/lib/LanguageContext';

export default function PeoplePage() {
  const { t } = useLanguage();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav', 'people')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('nav', 'people') === 'Personnes'
            ? 'Visiteurs, leads, employes et contacts principaux'
            : 'Visitors, leads, employees and main contacts'}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <h2 className="text-lg font-semibold text-gray-400 mb-2">
          {t('nav', 'people') === 'Personnes' ? 'Bientot disponible' : 'Coming soon'}
        </h2>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          {t('nav', 'people') === 'Personnes'
            ? 'Repertoire complet de toutes les personnes : visiteurs, leads, employes et contacts.'
            : 'Complete directory of all people: visitors, leads, employees and contacts.'}
        </p>
      </div>
    </div>
  );
}
