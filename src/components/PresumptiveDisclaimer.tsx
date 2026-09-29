import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PRESUMPTIVE_DISCLAIMER } from '../types';

interface PresumptiveDisclaimerProps {
  compact?: boolean;
  className?: string;
}

export const PresumptiveDisclaimer: React.FC<PresumptiveDisclaimerProps> = ({
  compact = false,
  className = '',
}) => {
  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/25 rounded-md text-amber-300 text-[11px] font-medium leading-tight shrink-0 shadow-sm ${className}`}
        title={PRESUMPTIVE_DISCLAIMER}
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
        <span className="truncate">{PRESUMPTIVE_DISCLAIMER}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-2.5 p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200 text-xs shadow-sm ${className}`}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
      <div className="space-y-0.5">
        <p className="font-semibold text-amber-300 tracking-wide uppercase text-[10px]">
          Statutory Evidentiary Notice
        </p>
        <p className="leading-relaxed">
          {PRESUMPTIVE_DISCLAIMER}
        </p>
      </div>
    </div>
  );
};
