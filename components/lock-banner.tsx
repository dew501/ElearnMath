import React from 'react';
import Link from 'next/link';

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
    <div
      style={{
        background: '#FFFBEB',
        border: '2px solid #F59E0B',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 4px 15px rgba(245, 158, 11, 0.08)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
      }}
      className="animate-in fade-in duration-200"
    >
      <div style={{ fontSize: '32px', lineHeight: 1 }} aria-hidden="true">
        🔒
      </div>
      <div style={{ flex: 1 }}>
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 800,
            color: '#92400E',
            margin: '0 0 6px 0',
          }}
        >
          {title}
        </h3>
        <div
          style={{
            fontSize: '13.5px',
            color: '#B45309',
            margin: '0 0 14px 0',
            lineHeight: 1.6,
          }}
        >
          {description}
        </div>
        <Link
          href={actionHref}
          style={{
            fontSize: '12.5px',
            padding: '8px 18px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#2E7BC4',
            color: '#ffffff',
            fontWeight: 600,
            borderRadius: '10px',
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(46, 123, 196, 0.25)',
          }}
          className="hover:bg-[#1B4E80] transition-colors"
        >
          {actionText}
        </Link>
      </div>
    </div>
  );
};
