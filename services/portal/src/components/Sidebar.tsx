'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import QuickBooksStatus from '@/components/QuickBooksStatus';

export interface SidebarLink {
  labelKey: string; // translation key in 'nav' section
  href: string;
  icon: React.ReactNode;
  children?: SidebarLink[]; // expandable sub-links
}

interface SidebarProps {
  links: SidebarLink[];
  bottomLinks?: SidebarLink[];
  userName: string;
  userRole: string;
  onLinkClick?: () => void;
}

export default function Sidebar({ links, bottomLinks, userName, userRole, onLinkClick }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { t } = useLanguage();

  // Track which expandable groups are open
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Auto-expand if any child is active
    const initial = new Set<string>();
    for (const link of links) {
      if (link.children) {
        const isChildActive = link.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'));
        if (isChildActive) initial.add(link.labelKey);
      }
    }
    return initial;
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const portalLabel = userRole === 'admin' ? t('nav', 'adminPortal') : t('nav', 'clientPortal');

  const renderLink = (link: SidebarLink) => {
    const isActive = pathname === link.href || pathname.startsWith(link.href + '/');

    // Expandable group
    if (link.children && link.children.length > 0) {
      const isExpanded = expandedGroups.has(link.labelKey);
      const isChildActive = link.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'));

      return (
        <div key={link.labelKey}>
          <button
            onClick={() => toggleGroup(link.labelKey)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              isChildActive
                ? 'text-brand-700 bg-brand-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {link.icon}
            <span className="flex-1 text-left">{t('nav', link.labelKey)}</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {isExpanded && (
            <div className="ml-4 pl-3 border-l border-gray-100 mt-0.5 mb-1 space-y-0.5">
              {link.children.map(child => {
                const childActive = pathname === child.href || pathname.startsWith(child.href + '/');
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={onLinkClick}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                      childActive
                        ? 'text-brand-700 bg-brand-50 font-medium'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {child.icon}
                    <span>{t('nav', child.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Regular link
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onLinkClick}
        className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
      >
        {link.icon}
        <span>{t('nav', link.labelKey)}</span>
      </Link>
    );
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      {/* Brand Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex flex-col items-center justify-center">
          <img
            src="/prisma-logo.svg"
            alt="Prisma"
            className="w-full h-auto max-h-[120px] object-contain"
          />
        </div>
        <p className="text-xs text-center text-gray-500 mt-1">{portalLabel}</p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {links.map(renderLink)}
      </nav>

      {/* Bottom Navigation Links */}
      {bottomLinks && bottomLinks.length > 0 && (
        <div className="px-4 pb-2 space-y-1">
          <div className="border-t border-gray-100 pt-3">
            {bottomLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onLinkClick}
                  className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
                >
                  {link.icon}
                  <span>{t('nav', link.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* QuickBooks status — admin only */}
      {userRole === 'admin' && (
        <div className="px-4 pb-3">
          <QuickBooksStatus />
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
