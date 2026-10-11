import { CHART_TYPES } from '../../utils/recommend.js';
import { AGGREGATIONS, GROUP_OPTIONS } from '../../utils/analytics.js';
import { Field, Input, Select } from '../ui/index.jsx';
import { FilterBuilder } from '../filters/FilterBuilder.jsx';
import { EMPTY_FILTER } from '../../utils/filters.js';

const CATEGORICAL_TYPES = ['chartType', 'x', 'ys', 'agg', 'groupBy', 'limit'];

/** Which configuration controls each chart type needs. */
function needs(type) {
  return {
    x: !['heatmap', 'table'].includes(type),
    ys: !['histogram', 'table', 'heatmap'].includes(type),
    multiY: ['bar', 'stacked', 'line', 'area', 'table'].includes(type),
    agg: ['bar', 'stacked', 'line', 'area', 'pie', 'donut'].includes(type),
    group: ['bar', 'stacked', 'line', 'area'].includes(type),
    limit: ['bar', 'stacked', 'pie', 'donut'].includes(type),
    yCountOnly: ['bar', 'stacked', 'line', 'area', 'pie', 'donut'].includes(type),
  };
}

/**
 * Controlled editor for one chart's configuration. Used by the Charts page,
 * the Dashboard Builder widget settings and anywhere else charts are customised.
 * Everything is driven by the real column list of the working table.
 */
export function ChartConfigEditor({ value, onChange, table, profile, showText, title, description, onTitle, onDescription }) {
  const cfg = value;
  const set = (patch) => onChange({ ...cfg, ...patch });
  const n = needs(cfg.chartType);
  const columns = table.columns;
  const numeric = profile.filter((c) => c.type === 'number');
  const dateCols = profile.filter((c) => c.type === 'date');
  const anyCols = columns;
  const xChoices = cfg.chartType === 'histogram' || cfg.chartType === 'scatter' ? numeric : anyCols;
  const yChoices = numeric;

  const toggleY = (key) => {
    const has = cfg.ys.includes(key);
    set({ ys: has ? cfg.ys.filter((k) => k !== key) : [...cfg.ys, key] });
  };

  const applyType = (t) => {
    // Keep settings coherent when switching chart type
    const next = { chartType: t };
    if (t === 'scatter' || t === 'histogram') {
      next.ys = t === 'scatter' ? cfg.ys.slice(0, 1) : cfg.ys.slice(0, 1);
      if (t === 'histogram' && !next.ys.length && numeric.length) next.ys = [numeric[0].key];
      if (t === 'histogram') next.x = next.ys[0] ?? null;
    }
    if (t === 'pie' || t === 'donut') next.ys = cfg.ys.slice(0, 1);
    if (t === 'line' || t === 'area') {
      if (!dateCols.length) next.groupBy = 'none';
    }
    if (t === 'heatmap' && !cfg.ys.length) next.ys = numeric.slice(0, 8).map((c) => c.key);
    set(next);
  };

  return (
    <div className="space-y-4">
      {(onTitle || onDescription) && (
        <div className="space-y-3">
          {onTitle && <Field label="Chart title"><Input value={title} onChange={(e) => onTitle(e.target.value)} maxLength={160} /></Field>}
          {onDescription && <Field label="Description"><Input value={description || ''} onChange={(e) => onDescription(e.target.value)} maxLength={500} placeholder="Optional subtitle" /></Field>}
        </div>
      )}

      <Field label="Chart type">
        <Select value={cfg.chartType} onChange={(e) => applyType(e.target.value)}>
          {CHART_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>

      {n.x && (
        <Field label={cfg.chartType === 'scatter' || cfg.chartType === 'histogram' ? (cfg.chartType === 'histogram' ? 'Value column' : 'X axis (numeric)') : 'X axis / category'}>
          <Select value={cfg.x || ''} onChange={(e) => set({ x: e.target.value || null })}>
            <option value="">Select column</option>
            {xChoices.map((c) => <option key={c.key} value={c.key}>{c.name} ({c.type})</option>)}
          </Select>
        </Field>
      )}

      {n.ys && cfg.chartType !== 'scatter' && n.multiY && (
        <Field label="Value series" hint={cfg.ys.length ? undefined : 'Leave empty to count rows per category.'}>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            {yChoices.length === 0 && <p className="text-xs text-slate-500">No numeric columns. Choose Count below.</p>}
            {yChoices.map((c) => (
              <label key={c.key} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <input type="checkbox" checked={cfg.ys.includes(c.key)} onChange={() => toggleY(c.key)} />
                {c.name}
              </label>
            ))}
          </div>
        </Field>
      )}

      {cfg.chartType === 'scatter' && (
        <Field label="Y axis (numeric)">
          <Select value={cfg.ys[0] || ''} onChange={(e) => set({ ys: e.target.value ? [e.target.value] : [] })}>
            <option value="">Select column</option>
            {yChoices.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </Select>
        </Field>
      )}

      {cfg.chartType === 'heatmap' && (
        <Field label="Numeric columns">
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            {yChoices.map((c) => (
              <label key={c.key} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm">
                <input type="checkbox" checked={cfg.ys.includes(c.key)} onChange={() => toggleY(c.key)} /> {c.name}
              </label>
            ))}
          </div>
        </Field>
      )}

      {cfg.chartType === 'table' && (
        <Field label="Columns to show">
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            {columns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm">
                <input type="checkbox" checked={cfg.ys.length === 0 || cfg.ys.includes(c.key)} onChange={() => {
                  const all = cfg.ys.length === 0 ? columns.map((x) => x.key) : cfg.ys;
                  set({ ys: all.includes(c.key) ? all.filter((k) => k !== c.key) : [...all, c.key] });
                }} /> {c.name}
              </label>
            ))}
          </div>
        </Field>
      )}

      {n.agg && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aggregation">
            <Select value={cfg.agg} onChange={(e) => set({ agg: e.target.value })}>
              {AGGREGATIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </Field>
          {n.group && (
            <Field label="Group dates by" hint={dateCols.length ? undefined : 'No date column detected.'}>
              <Select value={cfg.groupBy} onChange={(e) => set({ groupBy: e.target.value })} disabled={!dateCols.length || cfg.x && !dateCols.some((d) => d.key === cfg.x)}>
                {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {n.limit && (
        <Field label="Show top N categories">
          <Input type="number" min={2} max={100} value={cfg.limit} onChange={(e) => set({ limit: Math.max(2, Math.min(100, Number(e.target.value) || 15)) })} />
        </Field>
      )}

      {(cfg.chartType === 'histogram') && (
        <Field label="Number of bins"><Input type="number" min={3} max={60} value={cfg.bins || 12} onChange={(e) => set({ bins: Math.max(3, Math.min(60, Number(e.target.value) || 12)) })} /></Field>
      )}

      {showText !== false && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[['showLegend', 'Legend'], ['showGrid', 'Grid lines'], ['showLabels', 'Data labels'], ['showTooltip', 'Tooltips']].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-700">
              <input type="checkbox" checked={cfg[k] !== false && (k !== 'showLabels' ? true : cfg[k] === true)} onChange={(e) => set({ [k]: e.target.checked })} /> {l}
            </label>
          ))}
        </div>
      )}

      <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <summary className="cursor-pointer select-none text-sm font-medium">Chart-specific filters</summary>
        <div className="mt-3">
          <FilterBuilder value={cfg.filter || EMPTY_FILTER} onChange={(f) => set({ filter: f })} columns={columns} title="Applies only to this chart" />
        </div>
      </details>
    </div>
  );
}

export const CHART_CONFIG_KEYS = CATEGORICAL_TYPES;
