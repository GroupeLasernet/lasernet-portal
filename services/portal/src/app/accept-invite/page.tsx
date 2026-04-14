'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function AcceptInviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<{ email: string; name: string; role: string; mode?: 'invite' | 'reset' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing token.');
      setLoading(false);
      return;
    }
    fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setError(data.error || 'Invalid invite.');
        else setInvite(data.invite);
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (pw1 !== pw2) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to accept invite.');
      } else {
        router.push(data.user?.role === 'admin' ? '/admin' : '/');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md w-full bg-white rounded-lg shadow border border-gray-200 p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">
        {invite?.mode === 'reset' ? 'Reset password' : 'Accept invitation'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {invite?.mode === 'reset'
          ? 'Choose a new password for your account.'
          : 'Set a password to finish creating your account.'}
      </p>

      {loading ? (
        <p className="text-gray-500">Checking invite…</p>
      ) : error && !invite ? (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      ) : invite ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-gray-50 rounded border border-gray-200 text-sm">
            <div><span className="text-gray-500">Name:</span> {invite.name}</div>
            <div><span className="text-gray-500">Email:</span> {invite.email}</div>
            <div><span className="text-gray-500">Role:</span> {invite.role}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              minLength={8}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={8}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy
              ? (invite?.mode === 'reset' ? 'Saving…' : 'Creating account…')
              : (invite?.mode === 'reset' ? 'Save new password' : 'Create account')}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
        <AcceptInviteInner />
      </Suspense>
    </div>
  );
}
