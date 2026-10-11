import { formatShort } from '../../utils/analytics.js';
import { cn } from '../../lib/utils.js';

export function formatKpi(value, format) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'pct') return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  if (format === 'int') return Math.round(value).toLocaleString();
  const abs = Math.abs(value);
  if (abs >= 1e6) return formatShort(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** A KPI tile. `kpi` = { label, value, format, hint, tone } */
export function KpiCard({ kpi, className }) {
  const positive = kpi.format === 'pct' && kpi.value !== null && kpi.value >= 0;
  const negative = kpi.format === 'pct' && kpi.value !== null && kpi.value < 0;
  return (
    <div className={cn('card flex h-full min-w-0 flex-col justify-between p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg', className)}>
      <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400" title={kpi.label}>{kpi.label}</p>
      <p
        className={cn(
          'mt-2 truncate text-2xl font-semibold tabular-nums',
          positive && 'text-emerald-600 dark:text-emerald-400',
          negative && 'text-rose-600 dark:text-rose-400',
          kpi.tone === 'warn' && 'text-amber-600 dark:text-amber-400'
        )}
        title={String(kpi.value ?? '')}
      >
        {formatKpi(kpi.value, kpi.format)}
      </p>
      {kpi.hint && <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{kpi.hint}</p>}
    </div>
  );
}
