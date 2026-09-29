import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Info,
} from 'lucide-react';

export type StatusVariant =
  | 'positive'
  | 'negative'
  | 'inconclusive'
  | 'pass'
  | 'tamper'
  | 'warning'
  | 'intact'
  | 'broken'
  | 'info';

interface StatusChipProps {
  status?: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE' | string;
  variant?: StatusVariant;
  label?: string;
  icon?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  variant,
  label,
  icon = true,
  size = 'sm',
  className = '',
}) => {
  // Determine variant
  let resolvedVariant: StatusVariant = 'info';

  if (variant) {
    resolvedVariant = variant;
  } else if (status) {
    const s = status.toUpperCase();
    if (s === 'NEGATIVE' || s === 'PASS' || s === 'VERIFIED' || s === 'INTACT') {
      resolvedVariant = 'negative';
    } else if (s === 'POSITIVE' || s === 'TAMPER' || s === 'FAIL' || s === 'BROKEN' || s === 'ALTERED') {
      resolvedVariant = 'positive';
    } else if (s === 'INCONCLUSIVE' || s === 'WARNING' || s === 'FLAGGED' || s === 'AUDIT WARNING') {
      resolvedVariant = 'inconclusive';
    }
  }

  // Consistent Status Colors:
  // Green = pass / negative (clean / safe)
  // Red = tamper / positive alert (presumptive detected / security breach)
  // Amber = inconclusive / warning (uncertain / attention needed)
  let colorClasses = '';
  let defaultIcon: React.ReactNode = null;
  let displayLabel = label || status || '';

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  const iconCls = `${iconSizes[size]} shrink-0`;

  switch (resolvedVariant) {
    case 'negative':
    case 'pass':
    case 'intact':
      colorClasses = 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300';
      defaultIcon = resolvedVariant === 'intact'
        ? <ShieldCheck className={`${iconCls} text-emerald-400`} />
        : <CheckCircle2 className={`${iconCls} text-emerald-400`} />;
      if (!label && !status) displayLabel = 'NEGATIVE';
      break;

    case 'positive':
    case 'tamper':
    case 'broken':
      colorClasses = 'bg-rose-950/60 border-rose-500/40 text-rose-300';
      defaultIcon = resolvedVariant === 'broken' || resolvedVariant === 'tamper'
        ? <ShieldAlert className={`${iconCls} text-rose-400`} />
        : <AlertOctagon className={`${iconCls} text-rose-400`} />;
      if (!label && !status) displayLabel = resolvedVariant === 'positive' ? 'POSITIVE' : 'TAMPER';
      break;

    case 'inconclusive':
    case 'warning':
      colorClasses = 'bg-amber-950/60 border-amber-500/40 text-amber-300';
      defaultIcon = resolvedVariant === 'inconclusive'
        ? <HelpCircle className={`${iconCls} text-amber-400`} />
        : <AlertTriangle className={`${iconCls} text-amber-400`} />;
      if (!label && !status) displayLabel = 'INCONCLUSIVE';
      break;

    case 'info':
    default:
      colorClasses = 'bg-slate-800/80 border-slate-700 text-slate-300';
      defaultIcon = <Info className={`${iconCls} text-slate-400`} />;
      break;
  }

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2 py-0.5 text-xs gap-1.5',
    md: 'px-2.5 py-1 text-xs gap-1.5',
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-md border tracking-wide transition-colors ${sizeClasses[size]} ${colorClasses} ${className}`}
    >
      {icon && defaultIcon}
      <span>{displayLabel}</span>
    </span>
  );
};
