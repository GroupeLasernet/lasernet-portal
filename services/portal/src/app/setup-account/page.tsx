'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Avatar from '@/components/Avatar';
import Link from 'next/link';

interface InviteData {
  email: string;
  name: string;
  role: string;
  companyName: string;
}

function SetupAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError('No invitation token provided');
        setLoading(false);
        return;
      }

      try {
        // Decode the token to get the user data
        // This is a simple JWT decode - in production use a proper JWT library
        const parts = token.split('.');
        if (parts.length !== 3) {
          setError('Invalid invitation token');
          setLoading(false);
          return;
        }

        // Decode the payload (part 1) — use atob() for browser compatibility
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(
          decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          )
        );

        // Check if token is expired (exp claim)
        if (payload.exp && Date.now() / 1000 > payload.exp) {
          setError('Invitation has expired. Please request a new invitation.');
          setLoading(false);
          return;
        }

        // Check if it's an invite token
        if (payload.purpose !== 'invite') {
          setError('Invalid invitation token');
          setLoading(false);
          return;
        }

        // Set the invite data
        const data = {
          email: payload.email,
          name: payload.name,
          role: payload.role || 'Staff Member',
          companyName: payload.companyName,
        };

        setInviteData(data);
        setName(data.name);
        setEmail(data.email);
        setRole(data.role);

        // Fetch existing contact data (phone, photo) from managed clients
        try {
          const clientsRes = await fetch('/api/managed-clients');
          const clientsData = await clientsRes.json();
          if (clientsData.clients) {
            for (const c of clientsData.clients) {
              // Check responsible person
              if (c.responsiblePerson?.email?.toLowerCase() === data.email.toLowerCase()) {
                if (c.responsiblePerson.phone) setPhone(c.responsiblePerson.phone);
                if (c.responsiblePerson.photo) setPhoto(c.responsiblePerson.photo);
                if (c.responsiblePerson.role) setRole(c.responsiblePerson.role);
                break;
              }
              // Check employees
              const emp = c.subEmployees?.find((e: { email?: string }) => e.email?.toLowerCase() === data.email.toLowerCase());
              if (emp) {
                if (emp.phone) setPhone(emp.phone);
                if (emp.photo) setPhoto(emp.photo);
                if (emp.role) setRole(emp.role);
                break;
              }
            }
          }
        } catch (err) {
          console.error('Error fetching contact data:', err);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error verifying token:', err);
        setError('Failed to verify invitation token');
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handlePhotoChange = (base64: string) => {
    setPhoto(base64);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('All required fields must be filled');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create user via API
      const createResponse = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          role: 'client',
          phone: phone || undefined,
          photo: photo || undefined,
          company: inviteData?.companyName,
          status: 'active',
          password, // In production, hash this client-side or server-side
        }),
      });

      if (!createResponse.ok) {
        if (createResponse.status === 409) {
          setError('An account with this email already exists');
        } else {
          const data = await createResponse.json();
          setError(data.error || 'Failed to create account');
        }
        setSubmitting(false);
        return;
      }

      // Success!
      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login?message=Account created successfully. Please log in.');
      }, 2000);
    } catch (err) {
      console.error('Error creating account:', err);
      setError('An error occurred while creating your account');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !inviteData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="card">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-100 mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-center text-gray-900 mb-2">Invalid Invitation</h1>
            <p className="text-center text-gray-600 text-sm mb-6">{error}</p>
            <Link href="/login" className="btn-primary block text-center w-full">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="card">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-100 mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-center text-gray-900 mb-2">Account Created!</h1>
            <p className="text-center text-gray-600 text-sm mb-6">
              Your account has been set up successfully. Redirecting to login...
            </p>
            <div className="w-8 h-1 bg-gradient-to-r from-brand-600 to-brand-400 rounded-full mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Complete Your Registration</h1>
          <p className="text-gray-600">Welcome to LaserNet Portal. Set up your account to get started.</p>
        </div>

        {/* Setup Form */}
        <div className="card">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Photo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Profile Photo</label>
              <div className="flex items-center gap-4">
                <Avatar
                  photo={photo}
                  name={name || 'U'}
                  size="xl"
                  editable
                  onPhotoChange={handlePhotoChange}
                />
                <div>
                  <p className="text-xs text-gray-500">Click the avatar to upload a photo</p>
                  <p className="text-xs text-gray-400">Or leave empty for auto-generated initials</p>
                </div>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="input-field"
                disabled={submitting}
              />
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (not editable)</label>
              <input
                type="email"
                value={email}
                disabled
                className="input-field bg-gray-50 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">Your invitation was sent to this email</p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 514-555-0000"
                className="input-field"
                disabled={submitting}
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Your role"
                className="input-field"
                disabled={submitting}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="input-field"
                disabled={submitting}
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="input-field"
                disabled={submitting}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting ? 'Setting up account...' : 'Complete Registration'}
            </button>

            {/* Terms */}
            <p className="text-xs text-gray-500 text-center">
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Log in instead
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SetupAccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <SetupAccountContent />
    </Suspense>
  );
}
