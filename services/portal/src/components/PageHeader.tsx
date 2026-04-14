'use client';

// ============================================================
// PageHeader — standard page title block used on every admin/portal tab.
// Ensures identical typography, spacing, and alignment across the portal.
// Usage:
//   <PageHeader title="Machines" subtitle="Manage fleet" actions={<button>New</button>} />
// ============================================================

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}
