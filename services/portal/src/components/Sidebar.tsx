'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PrismaLogo from '@/components/PrismaLogo';
import SidebarReorderModal, { loadSidebarOrder, applySidebarOrder, applyChildOrder, type SidebarOrder } from './SidebarReorderModal';

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
  const [reorderOpen, setReorderOpen] = useState(false);
  const { t } = useLanguage();

  // ── Sidebar order from localStorage ──
  const [savedOrder, setSavedOrder] = useState<SidebarOrder | null>(null);
  useEffect(() => {
    setSavedOrder(loadSidebarOrder());
  }, []);

  const orderedLinks = applyChildOrder(
    applySidebarOrder(links, savedOrder?.top),
    savedOrder?.children
  );
  const orderedBottom = applySidebarOrder(bottomLinks || [], savedOrder?.bottom);

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
    // Root links like `/admin` must be exact-match only — otherwise prefix-
    // matching makes Dashboard light up on every /admin/* sub-page.
    // Deeper links (e.g. `/admin/search`) still use prefix-match so `/admin/
    // search/people` keeps Search active.
    const isRootHref = link.href.split('/').filter(Boolean).length <= 1;
    const isActive = isRootHref
      ? pathname === link.href
      : pathname === link.href || pathname.startsWith(link.href + '/');

    // Expandable group
    if (link.children && link.children.length > 0) {
      const isExpanded = expandedGroups.has(link.labelKey);
      const isChildActive = link.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'));

      return (
        <div key={link.labelKey}>
          <button
            onClick={() => toggleGroup(link.labelKey)}
            className={`group relative w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              isChildActive
                ? 'text-brand-700 dark:text-brand-300'
                : isExpanded
                  ? 'text-gray-800 dark:text-gray-200'
                  : 'text-gray-600 hover:text-brand-700 hover:translate-x-[3px] dark:text-gray-400 dark:hover:text-brand-300'
            }`}
            style={
              isChildActive
                ? { background: 'linear-gradient(90deg, rgba(244,114,182,0.16) 0%, rgba(244,114,182,0.04) 100%)' }
                : isExpanded
                  ? { background: 'linear-gradient(90deg, rgba(107,114,128,0.10) 0%, rgba(107,114,128,0.03) 100%)' }
                  : undefined
            }
          >
            {/* Soft glowing indicator bar when a child is active */}
            {isChildActive && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-[15%] bottom-[15%] w-[3px] rounded-r"
                style={{
                  background: 'linear-gradient(to bottom, #f472b6, #9d174d)',
                  boxShadow: '0 0 10px rgba(244, 114, 182, 0.55)',
                  transformOrigin: 'left center',
                  animation: 'sidebar-indicator-pop 420ms cubic-bezier(0.34,1.56,0.64,1)',
                }}
              />
            )}
            <span className={`transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
              isExpanded ? 'scale-110' : 'scale-100 group-hover:scale-[1.15] group-hover:-rotate-3'
            }`}>
              {link.icon}
            </span>
            <span className="flex-1 text-left">{t('nav', link.labelKey)}</span>
            <svg
              className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Animated collapsible children — CSS grid trick for height:auto animation */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
            style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div
                className={`ml-4 pl-3 mt-0.5 mb-1 space-y-0.5 border-l-2 transition-colors duration-300 ${
                  isExpanded
                    ? (isChildActive ? 'border-brand-400 dark:border-brand-500' : 'border-gray-200 dark:border-gray-600')
                    : 'border-transparent'
                }`}
              >
                {link.children.map((child, idx) => {
                  const childActive = pathname === child.href || pathname.startsWith(child.href + '/');
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onLinkClick}
                      style={{
                        transitionDelay: isExpanded ? `${idx * 50}ms` : '0ms',
                        opacity: isExpanded ? 1 : 0,
                        transform: isExpanded ? 'translateX(0)' : 'translateX(-8px)',
                        background: childActive
                          ? 'linear-gradient(90deg, rgba(244,114,182,0.16) 0%, rgba(244,114,182,0.04) 100%)'
                          : undefined,
                      }}
                      className={`group/child relative flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                        childActive
                          ? 'text-brand-700 font-medium dark:text-brand-300'
                          : 'text-gray-500 hover:text-brand-700 hover:translate-x-[2px] hover:bg-brand-50/40 dark:text-gray-400 dark:hover:text-brand-300 dark:hover:bg-brand-900/15'
                      }`}
                    >
                      {/* Child-active indicator — sits at the start of the row
                          (left-0), not on the vertical divider, so it bookends
                          the active row the same way the parent indicator does. */}
                      {childActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-[15%] bottom-[15%] w-[3px] rounded-r"
                          style={{
                            background: 'linear-gradient(to bottom, #f472b6, #9d174d)',
                            boxShadow: '0 0 10px rgba(244, 114, 182, 0.55)',
                            transformOrigin: 'left center',
                            animation: 'sidebar-indicator-pop 420ms cubic-bezier(0.34,1.56,0.64,1)',
                          }}
                        />
                      )}
                      <span className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/child:scale-110">
                        {child.icon}
                      </span>
                      <span>{t('nav', child.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
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
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen flex flex-col transition-colors">
      {/* Brand Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex flex-col items-center justify-center">
          <PrismaLogo className="w-36 text-gray-900 dark:text-white" />
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">{portalLabel}</p>
          {userRole === 'admin' && (
            <button
              onClick={() => setReorderOpen(true)}
              className="p-0.5 text-gray-400 hover:text-brand-600 dark:text-gray-500 dark:hover:text-brand-400 rounded transition-colors"
              title={t('nav', 'reorderSidebar')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {orderedLinks.map(renderLink)}
      </nav>

      {/* Bottom Navigation Links */}
      {orderedBottom.length > 0 && (
        <div className="px-4 pb-2 space-y-1">
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            {orderedBottom.map((link) => {
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

      {/* QuickBooks connection status now lives in Settings → APIs */}

      {/* User Info & Logout */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 bg-brand-100 dark:bg-brand-900/40 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {userName.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{userName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{userRole}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>{loggingOut ? t('nav', 'signingOut') : t('nav', 'signOut')}</span>
        </button>
      </div>
      {/* Reorder modal (admin only) */}
      {userRole === 'admin' && (
        <SidebarReorderModal
          links={links}
          bottomLinks={bottomLinks || []}
          open={reorderOpen}
          onClose={() => setReorderOpen(false)}
          onSave={(order) => setSavedOrder(order)}
        />
      )}
    </aside>
  );
}
