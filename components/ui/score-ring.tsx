'use client';

import React, { useEffect, useId, useState } from 'react';

interface ScoreRingProps {
  value: number | null;
  max: number;
  size?: number;
  caption?: string;
  tone?: 'blue' | 'orange' | 'green';
}

const WARNA = {
  blue: ['#5FA8E8', '#1B4E80'],
  orange: ['#FFB454', '#E37A12'],
  green: ['#5BD69B', '#15885A'],
};

/** Cincin skor yang terisi pelan saat muncul. */
export function ScoreRing({ value, max, size = 120, caption, tone = 'blue' }: ScoreRingProps) {
  const id = useId().replace(/:/g, '');
  const [tampil, setTampil] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setTampil(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const r = 42;
  const keliling = 2 * Math.PI * r;
  const persen = value === null || !max ? 0 : Math.max(0, Math.min(1, value / max));
  const [a, b] = WARNA[tone];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={a} />
              <stop offset="1" stopColor={b} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#E6EEF7" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={`url(#g${id})`}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={keliling}
            style={{
              strokeDashoffset: tampil ? keliling * (1 - persen) : keliling,
              transition: 'stroke-dashoffset 850ms var(--ease-out)',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[28px] leading-none font-extrabold text-[#1B4E80] tabular">{value ?? '–'}</span>
          <span className="text-xs font-semibold text-[#66748C] mt-1 tabular">dari {max}</span>
        </div>
      </div>
      {caption && <span className="text-xs font-semibold text-[#66748C] text-center">{caption}</span>}
    </div>
  );
}
