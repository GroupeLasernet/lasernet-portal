'use client';

// ============================================================
// HoldButton — must be held (default 2s) to trigger onConfirm.
// Fills visually while holding; releasing early cancels.
// Use for destructive or safety-sensitive actions (reset password, etc.).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

interface HoldButtonProps {
  onConfirm: () => void | Promise<void>;
  label: string;
  activeLabel?: string; // shown while holding (e.g. "Keep holding…")
  doneLabel?: string;   // shown briefly after trigger (e.g. "Sent!")
  durationMs?: number;  // default 2000
  disabled?: boolean;
  className?: string;   // extra classes for the button itself
  color?: 'blue' | 'red' | 'gray' | 'amber';
}

const COLOR_CLASSES: Record<NonNullable<HoldButtonProps['color']>, { base: string; fill: string; text: string }> = {
  blue:  { base: 'border-blue-300 hover:bg-blue-50',  fill: 'bg-blue-500/80',  text: 'text-blue-700'  },
  red:   { base: 'border-red-300 hover:bg-red-50',    fill: 'bg-red-500/80',   text: 'text-red-700'   },
  gray:  { base: 'border-gray-300 hover:bg-gray-50',  fill: 'bg-gray-500/70',  text: 'text-gray-700'  },
  amber: { base: 'border-amber-300 hover:bg-amber-50', fill: 'bg-amber-500/80', text: 'text-amber-700' },
};

export default function HoldButton({
  onConfirm,
  label,
  activeLabel = 'Keep holding…',
  doneLabel,
  durationMs = 2000,
  disabled = false,
  className = '',
  color = 'blue',
}: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [done, setDone] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const colors = COLOR_CLASSES[color];

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const tick = useCallback(() => {
    if (startedAtRef.current == null) return;
    const elapsed = performance.now() - startedAtRef.current;
    const p = Math.min(1, elapsed / durationMs);
    setProgress(p);
    if (p >= 1) {
      if (!firedRef.current) {
        firedRef.current = true;
        stopLoop();
        setHolding(false);
        Promise.resolve(onConfirm()).finally(() => {
          if (doneLabel) {
            setDone(true);
            setTimeout(() => {
              setDone(false);
              setProgress(0);
              firedRef.current = false;
            }, 1500);
          } else {
            setProgress(0);
            firedRef.current = false;
          }
        });
      }
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [durationMs, onConfirm, doneLabel, stopLoop]);

  const start = useCallback(() => {
    if (disabled || firedRef.current) return;
    setHolding(true);
    startedAtRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  const cancel = useCallback(() => {
    if (firedRef.current) return;
    stopLoop();
    setHolding(false);
    setProgress(0);
  }, [stopLoop]);

  const displayLabel = done && doneLabel ? doneLabel : holding ? activeLabel : label;

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={start}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      className={`relative overflow-hidden px-3 py-1.5 text-sm border rounded select-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colors.base} ${colors.text} ${className}`}
      style={{ touchAction: 'none' }}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 ${colors.fill}`}
        style={{
          width: `${Math.round(progress * 100)}%`,
          transition: holding ? 'none' : 'width 200ms ease-out',
          opacity: done ? 1 : 0.35,
        }}
      />
      <span className="relative z-10 font-medium">{displayLabel}</span>
    </button>
  );
}
