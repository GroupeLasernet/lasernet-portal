'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

interface SidebarLink {
  labelKey: string; // translation key in 'nav' section
  href: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  links: SidebarLink[];
  bottomLinks?: SidebarLink[];
  userName: string;
  userRole: string;
}

export default function Sidebar({ links, bottomLinks, userName, userRole }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { t } = useLanguage();

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const portalLabel = userRole === 'admin' ? t('nav', 'adminPortal') : t('nav', 'clientPortal');

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      {/* Brand Header */}
      <div className="p-4 border-b border-gray-100 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600">
        <div className="flex items-center justify-center gap-3 mb-2">
          <img
            src="/logo-dsm.png"
            alt="Atelier DSM"
            className="h-10 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <img
            src="/logo-lasernet.png"
            alt="Groupe Lasernet"
            className="h-16 w-auto object-contain"
          />
          <img
            src="/logo-summumliner.png"
            alt="Summum Liner"
            className="h-8 w-auto object-contain"
          />
        </div>
        <p className="text-xs text-center text-brand-200">{portalLabel}</p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <a
              key={link.href}
              href={link.href}
              className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
            >
              {link.icon}
              <span>{t('nav', link.labelKey)}</span>
            </a>
          );
        })}
      </nav>

      {/* Bottom Navigation Links */}
      {bottomLinks && bottomLinks.length > 0 && (
        <div className="px-4 pb-2 space-y-1">
          <div className="border-t border-gray-100 pt-3">
            {bottomLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
                >
                  {link.icon}
                  <span>{t('nav', link.labelKey)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* User Info & Logout */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-brand-700">
              {userName.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            <p className="text-xs text-gray-500">{userRole}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>{loggingOut ? t('nav', 'signingOut') : t('nav', 'signOut')}</span>
        </button>
      </div>
    </aside>
  );
}
