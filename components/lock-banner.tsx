import React from 'react';
import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';

interface LockBannerProps {
  title: string;
  description: React.ReactNode;
  actionText: string;
  actionHref: string;
}

export const LockBanner: React.FC<LockBannerProps> = ({
  title,
  description,
  actionText,
  actionHref,
}) => {
  return (
    <div className="relative overflow-hidden mb-6 rounded-2xl border-2 border-[#FBD38D] bg-gradient-to-br from-[#FFFBEB] to-[#FFF1DD] p-5 sm:p-6 flex items-start gap-4 shadow-[0_6px_20px_rgba(240,147,43,0.10)] anim-rise">
      <span className="absolute -right-3 -bottom-6 text-[96px] font-extrabold text-[#F0932B]/10 select-none" aria-hidden="true">
        ?
      </span>
      <div className="w-11 h-11 rounded-xl bg-white border border-[#FBD38D] flex items-center justify-center shrink-0 shadow-sm">
        <Lock className="w-5 h-5 text-[#E37A12]" />
      </div>
      <div className="flex-1 relative">
        <h3 className="text-base font-extrabold text-[#92400E] mb-1.5">{title}</h3>
        <div className="text-[13.5px] text-[#9A5A0B] leading-relaxed mb-4">{description}</div>
        <Link
          href={actionHref}
          className="btn-press inline-flex items-center gap-1.5 text-[13px] px-4 py-2 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)]"
        >
          {actionText.replace(/\s*→\s*$/, '')}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
};
