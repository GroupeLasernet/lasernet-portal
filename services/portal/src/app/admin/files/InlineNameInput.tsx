'use client';

// ============================================================
// InlineNameInput — shared inline text input used for renaming
// a folder and creating a new (sub)folder. Auto-focuses + selects
// on mount, submits on Enter, cancels on Escape, and submits-or-
// cancels on blur depending on whether the user typed anything.
// ============================================================

import { useEffect, useRef } from 'react';

export function InlineNameInput({
  value,
  onChange,
  placeholder,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => {
        // Submit-on-blur if the user typed something, otherwise cancel.
        if (value.trim()) onSubmit(); else onCancel();
      }}
      className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-400 flex-1 w-full"
    />
  );
}
