import React from 'react';

export function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute w-[500px] h-[500px] rounded-full blur-[80px] bg-gradient-to-r from-[#5FA8E8] to-[#2E7BC4] top-[-100px] left-[10%] opacity-35" />
      <div className="absolute w-[450px] h-[450px] rounded-full blur-[80px] bg-gradient-to-r from-[#FFB454] to-[#F0932B] bottom-[-50px] right-[5%] opacity-30" />
    </div>
  );
}
