'use client';

/**
 * AnimatedNumber — blurred-morph animated number display.
 *
 * On mount (default): animates from 0 → value.
 * On subsequent value changes: animates previous → new, per-digit morph.
 *
 * Each changing digit's old value fades + slides up + blurs out, while
 * the new value fades + slides in + unblurs from below. Staggered L→R.
 *
 * Props:
 *   value          — the number to render
 *   prefix         — e.g. "$" (static, not animated)
 *   suffix         — label like "projects" (rendered smaller, static)
 *   format         — override formatter; defaults to en-US locale
 *   className      — Tailwind classes for color/size (font-size inherited)
 *   stagger        — ms between digits; default 70
 *   duration       — ms per digit; default 550
 *   animateOnMount — if true (default), first render animates from 0
 */

import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
  className?: string;
  stagger?: number;
  duration?: number;
  animateOnMount?: boolean;
};

export default function AnimatedNumber({
  value,
  prefix = '',
  suffix,
  format,
  className = '',
  stagger = 70,
  duration = 550,
  animateOnMount = true,
}: Props) {
  const fmt = format || ((n: number) => n.toLocaleString('en-US'));

  // Track previous rendered value so we know what to morph FROM.
  const prevRef = useRef<number>(animateOnMount ? 0 : value);
  const [fromStr, setFromStr] = useState<string>(() => fmt(prevRef.current));
  const [toStr, setToStr] = useState<string>(() => fmt(value));
  // Bump key on each transition so CSS animations re-fire on remount.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (prevRef.current === value) return;
    setFromStr(fmt(prevRef.current));
    setToStr(fmt(value));
    setTick((t) => t + 1);
    prevRef.current = value;
  }, [value, fmt]);

  // Pad on the LEFT with spaces so "comma-dance" (999 → 1,000) animates
  // with separators lining up from the right.
  const maxLen = Math.max(fromStr.length, toStr.length);
  const pFrom = fromStr.padStart(maxLen, ' ');
  const pTo = toStr.padStart(maxLen, ' ');

  return (
    <span
      className={`inline-flex items-baseline ${className}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {prefix && <span>{prefix}</span>}
      <span className="inline-flex">
        {Array.from({ length: maxLen }).map((_, i) => {
          const o = pFrom[i];
          const n = pTo[i];
          const same = o === n;
          const oldIsDigit = /\d/.test(o);
          const newIsDigit = /\d/.test(n);
          const delay = i * stagger;

          // Unchanged position — render statically (but still tracked by tick key
          // so React remounts when a fresh animation pass begins).
          if (same) {
            return (
              <span key={`${tick}-${i}-s`} className="inline-block">
                {n === ' ' ? '' : n}
              </span>
            );
          }

          // Changed position — overlay old (exit) and new (enter) on an
          // invisible "ghost" that sizes the slot.
          const ghost = n !== ' ' ? n : o;
          return (
            <span
              key={`${tick}-${i}-c`}
              className="relative inline-block overflow-hidden align-baseline"
            >
              <span className="invisible">{ghost}</span>
              {oldIsDigit && o !== ' ' && (
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    animation: `an-morph-out ${duration}ms cubic-bezier(0.4,0,1,1) forwards`,
                    animationDelay: `${delay}ms`,
                  }}
                >
                  {o}
                </span>
              )}
              {newIsDigit && n !== ' ' && (
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    animation: `an-morph-in ${duration}ms cubic-bezier(0,0,0.2,1) forwards`,
                    animationDelay: `${delay}ms`,
                    opacity: 0,
                  }}
                >
                  {n}
                </span>
              )}
              {/* Non-digit (e.g., comma shifting position) — just render instantly */}
              {!newIsDigit && n !== ' ' && (
                <span className="absolute inset-0 flex items-center justify-center">
                  {n}
                </span>
              )}
            </span>
          );
        })}
      </span>
      {suffix && (
        <span className="ml-1.5 text-sm font-normal text-gray-500 dark:text-gray-400">
          {suffix}
        </span>
      )}
    </span>
  );
}
