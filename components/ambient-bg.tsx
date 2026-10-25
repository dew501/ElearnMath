import React from 'react';

// Simbol matematika yang melayang pelan di latar (opasitas rendah, berhenti bila "reduce motion").
const GLYPHS = [
  { c: 'π', top: '12%', left: '6%', size: 64, dur: 26, delay: 0 },
  { c: '∑', top: '68%', left: '4%', size: 54, dur: 30, delay: -6 },
  { c: '√x', top: '22%', left: '88%', size: 46, dur: 24, delay: -3 },
  { c: '∞', top: '78%', left: '86%', size: 58, dur: 28, delay: -9 },
  { c: 'x²', top: '44%', left: '94%', size: 40, dur: 22, delay: -12 },
  { c: '÷', top: '88%', left: '42%', size: 44, dur: 27, delay: -4 },
  { c: '△', top: '6%', left: '52%', size: 38, dur: 25, delay: -15 },
];

export function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      <div className="absolute inset-0 math-grid math-grid-fade" />
      <div className="absolute w-[500px] h-[500px] rounded-full blur-[80px] bg-gradient-to-r from-[#5FA8E8] to-[#2E7BC4] top-[-100px] left-[10%] opacity-35" />
      <div className="absolute w-[450px] h-[450px] rounded-full blur-[80px] bg-gradient-to-r from-[#FFB454] to-[#F0932B] bottom-[-50px] right-[5%] opacity-30" />
      <div className="hidden md:block">
        {GLYPHS.map((g) => (
          <span
            key={g.c}
            className="glyph"
            style={{ top: g.top, left: g.left, fontSize: g.size, ['--dur' as string]: `${g.dur}s`, ['--delay' as string]: `${g.delay}s` }}
          >
            {g.c}
          </span>
        ))}
      </div>
    </div>
  );
}
