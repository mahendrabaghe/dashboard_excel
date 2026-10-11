import { memo, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ZAxis,
} from 'recharts';
import { aggregateForChart, histogram, scatterPoints, correlationMatrix, formatShort, numericColumns, columnProfile } from '../../utils/analytics.js';
import { cn } from '../../lib/utils.js';

export const PALETTE = ['#3278f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,.12)', fontSize: 12 },
};

/**
 * Renders any supported chart from the working table.
 * `table` and `rows` are the already-filtered working data, so every chart reflects
 * the cleaned dataset and the active filters.
 */
function ChartRendererImpl({ table, rows, profile, config, height = 280, showEmpty = true }) {
  const cfg = config || {};
  const type = cfg.chartType || 'bar';
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const tick = { fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 };
  const gridColor = dark ? '#1e293b' : '#e2e8f0';

  const model = useMemo(() => {
    if (!table || !rows) return null;
    try {
      if (type === 'histogram') {
        const key = cfg.x || cfg.ys?.[0];
        return { kind: 'hist', data: key ? histogram(table, rows, key, cfg.bins || 12) : [] };
      }
      if (type === 'scatter') {
        const xKey = cfg.x;
        const yKey = cfg.ys?.[0];
        if (!xKey || !yKey) return { kind: 'empty', reason: 'Choose an X and a Y numeric column.' };
        return { kind: 'scatter', data: scatterPoints(table, rows, xKey, yKey), xName: table.columns.find((c) => c.key === xKey)?.name, yName: table.columns.find((c) => c.key === yKey)?.name };
      }
      if (type === 'heatmap') {
        const prof = profile || columnProfile(table);
        const keys = cfg.ys?.length ? cfg.ys : numericColumns(prof).map((c) => c.key);
        const pCols = prof.filter((c) => keys.includes(c.key));
        if (pCols.length < 2) return { kind: 'empty', reason: 'Correlation needs at least two numeric columns.' };
        const { names, matrix } = correlationMatrix(table, rows, pCols);
        return { kind: 'heatmap', names, matrix };
      }
      if (type === 'table') {
        const keys = cfg.ys?.length ? cfg.ys : table.columns.map((c) => c.key);
        const cols = table.columns.map((c, i) => ({ ...c, i })).filter((c) => keys.includes(c.key));
        return { kind: 'table', cols, rows: rows.slice(0, cfg.limit || 100) };
      }
      if (!cfg.x) return { kind: 'empty', reason: 'Choose a column for the X axis.' };
      const ys = cfg.ys?.length ? cfg.ys : [];
      const agg = aggregateForChart(table, rows, { x: cfg.x, ys: ys.length ? ys : [cfg.x], agg: ys.length ? cfg.agg || 'sum' : 'count', groupBy: cfg.groupBy || 'none', limit: cfg.limit || 15 });
      if (!agg.data.length) return { kind: 'empty', reason: 'No data matches this chart.' };
      return { kind: 'cat', ...agg };
    } catch (e) {
      return { kind: 'error', reason: e.message };
    }
  }, [table, rows, profile, cfg, type]);

  if (!model) return <Box>Loading data...</Box>;
  if (model.kind === 'error') return <Box tone="error">{model.reason}</Box>;
  if (model.kind === 'empty') return showEmpty ? <Box>{model.reason}</Box> : null;

  const common = { margin: { top: 8, right: 16, left: 0, bottom: 4 } };
  const legend = cfg.showLegend !== false;
  const labels = cfg.showLabels === true;
  const grid = cfg.showGrid !== false;
  const tooltip = cfg.showTooltip !== false;

  if (model.kind === 'table') {
    return (
      <div className="max-h-[360px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>{model.cols.map((c) => <th key={c.key} className="th">{c.name}</th>)}</tr>
          </thead>
          <tbody>
            {model.rows.map((r, ri) => (
              <tr key={ri}>{model.cols.map((c) => <td key={c.key} className="td">{fmtCell(r[c.i])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (model.kind === 'heatmap') {
    return <Heatmap names={model.names} matrix={model.matrix} />;
  }

  if (model.kind === 'hist') {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer>
          <BarChart data={model.data} {...common}>
            {grid && <CartesianGrid stroke={gridColor} vertical={false} />}
            <XAxis dataKey="name" tick={tick} interval="preserveStartEnd" />
            <YAxis tick={tick} allowDecimals={false} />
            {tooltip && <Tooltip {...tooltipStyle} />}
            <Bar dataKey="count" name="Count" fill={PALETTE[0]} radius={[4, 4, 0, 0]} isAnimationActive />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (model.kind === 'scatter') {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer>
          <ScatterChart {...common}>
            {grid && <CartesianGrid stroke={gridColor} />}
            <XAxis type="number" dataKey="x" name={model.xName} tick={tick} tickFormatter={formatShort} />
            <YAxis type="number" dataKey="y" name={model.yName} tick={tick} tickFormatter={formatShort} />
            <ZAxis range={[40, 40]} />
            {tooltip && <Tooltip cursor={{ strokeDasharray: '3 3' }} {...tooltipStyle} formatter={(v) => formatShort(v)} />}
            <Scatter data={model.data} fill={PALETTE[0]} fillOpacity={0.6} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Category / time-series charts
  const { data, series } = model;
  const type2 = type;

  if (type2 === 'pie' || type2 === 'donut') {
    const k = series[0].key;
    const pieData = data.map((d) => ({ name: d.name, value: Math.max(0, d[k]) })).filter((d) => d.value > 0);
    if (!pieData.length) return <Box>All values are zero or negative, so a proportion cannot be drawn.</Box>;
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={type2 === 'donut' ? '55%' : 0} outerRadius="80%" paddingAngle={2} label={labels} isAnimationActive>
              {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            {tooltip && <Tooltip {...tooltipStyle} formatter={(v, name) => [formatShort(v), name]} />}
            {legend && <Legend wrapperStyle={{ fontSize: 12 }} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const ChartComp = type2 === 'line' ? LineChart : type2 === 'area' ? AreaChart : BarChart;
  const stacked = type2 === 'stacked';
  const renderSeries = (s, i) => {
    const color = PALETTE[i % PALETTE.length];
    if (type2 === 'line') return <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={color} strokeWidth={2.5} dot={data.length < 40} activeDot={{ r: 5 }} isAnimationActive />;
    if (type2 === 'area') return <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2.5} isAnimationActive />;
    return <Bar key={s.key} dataKey={s.key} name={s.name} fill={color} radius={[4, 4, 0, 0]} stackId={stacked ? 'stack' : undefined} isAnimationActive label={labels ? { fontSize: 10, fill: tick.fill } : false} />;
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ChartComp data={data} {...common}>
          {grid && <CartesianGrid stroke={gridColor} vertical={false} />}
          <XAxis dataKey="name" tick={tick} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={tick} tickFormatter={formatShort} width={56} />
          {tooltip && <Tooltip {...tooltipStyle} formatter={(v) => formatShort(v)} />}
          {legend && series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map(renderSeries)}
        </ChartComp>
      </ResponsiveContainer>
    </div>
  );
}

function fmtCell(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return String(v);
}

function Box({ children, tone }) {
  return (
    <div className={cn('grid place-items-center rounded-lg border border-dashed p-6 text-center text-sm', tone === 'error' ? 'border-rose-300 text-rose-600' : 'border-slate-300 text-slate-500 dark:border-slate-700')} style={{ minHeight: 160 }}>
      {children}
    </div>
  );
}

function Heatmap({ names, matrix }) {
  const colorFor = (r) => {
    if (r === null) return 'bg-slate-100 dark:bg-slate-800';
    const a = Math.abs(r);
    if (r >= 0) return a > 0.7 ? 'bg-brand-600 text-white' : a > 0.4 ? 'bg-brand-400 text-white' : 'bg-brand-100 dark:bg-brand-900/50';
    return a > 0.7 ? 'bg-rose-600 text-white' : a > 0.4 ? 'bg-rose-400 text-white' : 'bg-rose-100 dark:bg-rose-900/50';
  };
  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {names.map((n) => <th key={n} className="max-w-[90px] truncate px-1 text-left font-medium text-slate-500" title={n}>{n}</th>)}
          </tr>
        </thead>
        <tbody>
          {names.map((rn, i) => (
            <tr key={rn}>
              <th className="max-w-[110px] truncate pr-2 text-right font-medium text-slate-500" title={rn}>{rn}</th>
              {names.map((cn2, j) => (
                <td key={cn2} title={`${rn} × ${cn2}: ${matrix[i][j] === null ? 'n/a' : matrix[i][j].toFixed(2)}`} className={cn('grid h-11 w-16 place-items-center rounded-md font-semibold tabular-nums', colorFor(matrix[i][j]))}>
                  {matrix[i][j] === null ? '—' : matrix[i][j].toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ChartRenderer = memo(ChartRendererImpl);
export default ChartRenderer;
