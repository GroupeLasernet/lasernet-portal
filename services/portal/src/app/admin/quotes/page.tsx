'use client';

import { useLanguage } from '@/lib/LanguageContext';

export default function QuotesPage() {
  const { t } = useLanguage();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav', 'quotes')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('nav', 'quotes') === 'Soumissions'
            ? 'Gérez vos soumissions et devis QuickBooks'
            : 'Manage your QuickBooks estimates and quotes'}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h2 className="text-lg font-semibold text-gray-400 mb-2">
          {t('nav', 'quotes') === 'Soumissions' ? 'Bientôt disponible' : 'Coming soon'}
        </h2>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          {t('nav', 'quotes') === 'Soumissions'
            ? 'Les soumissions QuickBooks seront affichées ici — création, suivi et envoi directement depuis le portail.'
            : 'QuickBooks estimates will be displayed here — create, track, and send quotes directly from the portal.'}
        </p>
      </div>
    </div>
  );
}
