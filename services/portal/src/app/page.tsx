'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to login page
    router.push('/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600">
      <div className="text-center text-white">
        <div className="animate-pulse">
          <h1 className="text-4xl font-bold">LaserNet</h1>
          <p className="mt-2 text-brand-200">Loading...</p>
        </div>
      </div>
    </div>
  );
}
