'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError(t('forgot', 'emailRequired'));
      return;
    }
    setSubmitting(true);
    try {
      // We don't need to (and shouldn't) tell the user whether the email exists.
      // The backend silently no-ops if the email isn't found; we always show the
      // generic "check your inbox" confirmation so we don't enumerate accounts.
      await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch {
      setError(t('forgot', 'somethingWentWrong'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 px-4">
      <div className="w-full max-w-md">
        <div className="text-center">
          <img src="/prisma-logo-light.svg" alt="Prisma" className="h-40 w-auto mx-auto" />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mt-2">
          {submitted ? (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-100 mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-center text-gray-900 dark:text-gray-100 mb-2">
                {t('forgot', 'checkInboxTitle')}
              </h1>
              <p className="text-center text-gray-600 dark:text-gray-400 text-sm mb-6">
                {t('forgot', 'checkInboxBody')}
              </p>
              <Link href="/login" className="btn-primary block text-center w-full">
                {t('forgot', 'backToLogin')}
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {t('forgot', 'title')}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('forgot', 'subtitle')}
                </p>
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('login', 'emailAddress')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary text-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? t('forgot', 'sending') : t('forgot', 'sendReset')}
              </button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700">
                  {t('forgot', 'backToLogin')}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
