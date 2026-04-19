'use client';

/**
 * PrismaLogo — animated brand mark.
 *
 * Renders the prism SVG with:
 *  - a slow "breathe" animation on the prism itself
 *  - a soft radial aura pulsing behind it
 *  - slow orbital particles hugging the logo like bees around a flower
 *
 * The wordmark ("PRISMA") uses fill="currentColor", so the text color follows
 * the parent's Tailwind color class (e.g. `text-gray-900 dark:text-white`,
 * or `text-white` on dark backgrounds like the login gradient).
 *
 * Props
 *   animated      — disables ALL motion (breathe/aura/particles) when false. Default true.
 *   showParticles — disables just the orbital dots (useful at very small sizes). Default true.
 *   className     — applied to the root wrapper; set size (e.g. `h-56`) and color here.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  animated?: boolean;
  showParticles?: boolean;
  className?: string;
  /** Accessible label. Defaults to "Prisma". */
  alt?: string;
};

type Particle = {
  dur: number;
  delay: number;
  bob: number;
  bobDelay: number;
  /** radius as a fraction of the rendered width (0–1) */
  radiusFrac: number;
  angle: number;
  size: number;
  opacity: number;
  reverse: boolean;
};

const seedParticles = (n: number): Particle[] =>
  Array.from({ length: n }, () => ({
    dur: 55 + Math.random() * 40,        // 55–95 s per lap — very slow
    delay: -Math.random() * 80,          // desync
    bob: 4 + Math.random() * 5,          // 4–9 s in/out bob
    bobDelay: -Math.random() * 8,
    radiusFrac: 0.38 + Math.random() * 0.20, // 0.38–0.58 of width — close to logo
    angle: Math.random() * 360,
    size: 3 + Math.random() * 3,         // 3–6 px
    opacity: 0.55 + Math.random() * 0.4,
    reverse: Math.random() < 0.5,
  }));

export default function PrismaLogo({
  animated = true,
  showParticles = true,
  className = '',
  alt = 'Prisma',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Track rendered width so particle radii can scale with the logo size
  useEffect(() => {
    if (!animated || !showParticles) return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [animated, showParticles]);

  // Seed once per component instance
  const particles = useMemo(() => seedParticles(12), []);

  // Below ~140 px the particles look messy — skip them
  const enableParticles = animated && showParticles && width >= 140;

  return (
    <div
      ref={ref}
      className={`relative inline-block ${className}`}
      role="img"
      aria-label={alt}
    >
      {animated && <div className="prisma-aura" aria-hidden="true" />}

      {enableParticles && (
        <div className="prisma-orbits" aria-hidden="true">
          {particles.map((p, i) => (
            <div
              key={i}
              className={p.reverse ? 'prisma-orbit--rev' : 'prisma-orbit'}
              style={{
                transform: `rotate(${p.angle}deg)`,
                ['--dur' as string]: `${p.dur}s`,
                ['--delay' as string]: `${p.delay}s`,
              }}
            >
              <div
                className="prisma-dot"
                style={{
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  opacity: p.opacity,
                  ['--r' as string]: `${p.radiusFrac * width}px`,
                  ['--bob' as string]: `${p.bob}s`,
                  ['--bobDelay' as string]: `${p.bobDelay}s`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <svg
        className={`relative z-10 w-full h-auto block ${animated ? 'prisma-breathe' : ''}`}
        viewBox="0 0 800 700"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="pl_b0" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#9d174d" />
          </linearGradient>
          <linearGradient id="pl_h0" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbcfe8" />
            <stop offset="100%" stopColor="#be185d" />
          </linearGradient>
          <linearGradient id="pl_b1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
          <linearGradient id="pl_h1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fed7aa" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <linearGradient id="pl_b2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#881337" />
          </linearGradient>
          <linearGradient id="pl_h2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fda4af" />
            <stop offset="100%" stopColor="#9f1239" />
          </linearGradient>
        </defs>
        <polygon points="400,-3.32 680,481.66 515.46,386.66 400,186.68" fill="url(#pl_b0)" />
        <polygon points="680,481.66 120,481.66 284.54,386.66 515.46,386.66" fill="url(#pl_b1)" />
        <polygon points="120,481.66 400,-3.32 400,186.68 284.54,386.66" fill="url(#pl_b2)" />
        <polygon points="680,481.66 550,481.66 385.46,386.66 515.46,386.66" fill="url(#pl_h0)" />
        <polygon points="120,481.66 185,369.07 349.54,274.07 284.54,386.66" fill="url(#pl_h1)" />
        <polygon points="400,-3.32 465,109.27 465,299.27 400,186.68" fill="url(#pl_h2)" />
        <polygon points="673.5,481.66 556.5,481.66 540.91,472.66 657.91,472.66" fill="#ffffff" opacity="0.35" />
        <polygon points="123.25,476.03 181.75,374.70 197.34,365.70 138.84,467.03" fill="#ffffff" opacity="0.35" />
        <polygon points="403.25,2.31 461.75,103.64 461.75,121.64 403.25,20.31" fill="#ffffff" opacity="0.35" />
        <text
          x="400"
          y="525.86"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="130"
          fontWeight="100"
          letterSpacing="16"
          fill="currentColor"
        >
          PRISMA
        </text>
      </svg>
    </div>
  );
}
