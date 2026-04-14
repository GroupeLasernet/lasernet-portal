'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error === 'Invalid email or password' ? t('login', 'invalidCredentials') : (data.error || t('login', 'loginFailed')));
        return;
      }

      // Redirect based on role
      if (data.user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/portal');
      }
    } catch {
      setError(t('login', 'somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 px-4">
      <div className="w-full max-w-md">
        {/* Prisma logo */}
        <div className="text-center mb-6">
          <img
            src="/prisma-logo-light.svg"
            alt="Prisma"
            className="h-56 w-auto mx-auto"
          />
        </div>

        {/* Partner logos */}
        <div className="flex items-center justify-center gap-6 mb-6 -mx-32 sm:-mx-48">
          <img
            src="/logo-dsm.png"
            alt="DSM"
            style={{ height: '80px', width: 'auto', flexShrink: 0 }}
            className="object-contain opacity-90"
          />
          <img
            src="/logo-lasernet.png"
            alt="LaserNet"
            style={{ height: '168px', width: 'auto', flexShrink: 0 }}
            className="object-contain opacity-90"
          />
          <img
            src="/logo-summumliner.png"
            alt="Summum Liner"
            style={{ height: '40px', width: 'auto', flexShrink: 0 }}
            className="object-contain opacity-90"
          />
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
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
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {t('login', 'password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary text-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('login', 'signingIn') : t('login', 'signIn')}
            </button>
          </form>

          {/* Language Selector */}
          <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-center gap-3">
            <span className="text-xs text-gray-400">{t('login', 'language')} :</span>
            <button
              onClick={() => setLang('fr')}
              className={`text-sm px-3 py-1 rounded-lg transition-colors ${lang === 'fr' ? 'bg-brand-600 text-white font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Français
            </button>
            <button
              onClick={() => setLang('en')}
              className={`text-sm px-3 py-1 rounded-lg transition-colors ${lang === 'en' ? 'bg-brand-600 text-white font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              English
            </button>
          </div>

          {/* Demo Credentials */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs text-gray-500 text-center mb-3">{t('login', 'demoAccounts')}</p>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg">
                <span><strong>Admin:</strong> admin@lasernet.ca</span>
                <span>admin123</span>
              </div>
              <div className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg">
                <span><strong>Client:</strong> client@example.com</span>
                <span>client123</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
