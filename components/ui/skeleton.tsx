import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Kerangka halaman saat data dimuat (navbar + kartu). */
export function PageSkeleton({ label = 'Memuat...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-16 bg-white/60 backdrop-blur-md border-b border-white/70 px-4 sm:px-6 flex items-center justify-between">
        <Skeleton className="w-36 h-8" />
        <Skeleton className="w-28 h-8 rounded-full" />
      </div>
      <div className="flex-1 p-6 md:p-8 max-w-[920px] w-full mx-auto space-y-5">
        <Skeleton className="w-40 h-7" />
        <div className="glass-card p-6 md:p-8 space-y-4">
          <Skeleton className="w-32 h-5" />
          <Skeleton className="w-3/4 h-8" />
          <Skeleton className="w-full h-16" />
        </div>
        <div className="glass-card p-6 md:p-8 space-y-3">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-11/12 h-4" />
          <Skeleton className="w-4/5 h-4" />
        </div>
      </div>
    </div>
  );
}
