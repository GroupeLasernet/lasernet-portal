'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';

interface DashboardShellProps {
  children: React.ReactNode;
  requiredRole: 'admin' | 'client';
  links: { labelKey: string; href: string; icon: React.ReactNode }[];
  bottomLinks?: { labelKey: string; href: string; icon: React.ReactNode }[];
}

export default function DashboardShell({ children, requiredRole, links, bottomLinks }: DashboardShellProps) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
      })
      .then((data) => {
        if (data.user.role !== requiredRole) {
          // Wrong role, redirect to correct area
          router.push(data.user.role === 'admin' ? '/admin' : '/portal');
          return;
        }
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        router.push('/login');
      });
  }, [requiredRole, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-3 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar links={links} bottomLinks={bottomLinks} userName={user?.name || ''} userRole={user?.role || ''} />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
