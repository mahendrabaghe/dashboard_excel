/**
 * Analytics computed from the REAL working table (after cleaning and filters).
 * Nothing here is hardcoded: every KPI, grouping and chart is derived from data.
 */
import { parseDate } from '@shared/dataUtils.js';

export const AGGREGATIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
];

export const GROUP_OPTIONS = [
  { value: 'none', label: 'None (use values as-is)' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Bucket a date value by month / quarter / year. Returns a sortable label or null. */
export function timeBucket(value, groupBy) {
  const d = value instanceof Date ? value : parseDate(value) || (typeof value === 'string' ? new Date(value) : null);
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (groupBy === 'year') return String(y);
  if (groupBy === 'quarter') return `${y}-Q${Math.floor(m / 3) + 1}`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function bucketDisplay(label, groupBy) {
  if (!label) return label;
  if (groupBy === 'year') return label;
  if (groupBy === 'quarter') return label.replace('-', ' ');
  const [y, m] = label.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function columnProfile(table) {
  return table.columns.map((c, index) => {
    let missing = 0;
    const seen = new Set();
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (const r of table.rows) {
      const v = r[index];
      if (v === null || v === undefined || v === '') {
        missing += 1;
        continue;
      }
      seen.add(v);
      if (c.type === 'number' && typeof v === 'number') {
        min = Math.min(min, v);
        max = Math.max(max, v);
        sum += v;
        count += 1;
      }
    }
    return {
      ...c,
      index,
      missing,
      unique: seen.size,
      min: count ? min : null,
      max: count ? max : null,
      mean: count ? sum / count : null,
    };
  });
}

export function numericColumns(profile) {
  return profile.filter((c) => c.type === 'number');
}
export function dateColumns(profile) {
  return profile.filter((c) => c.type === 'date');
}
export function categoryColumns(profile, rowCount) {
  return profile.filter(
    (c) => c.type === 'text' && c.unique >= 2 && c.unique <= Math.min(60, Math.max(12, rowCount * 0.5))
  );
}

const REVENUE_RE = /revenue|sales|amount|total|price|income|profit|value|cost|spend/i;
const CUSTOMER_RE = /customer|client|user|account|buyer|member/i;

export function primaryMetric(profile) {
  const nums = numericColumns(profile);
  return nums.find((c) => REVENUE_RE.test(c.name)) || nums[0] || null;
}

export function primaryCategory(profile, rowCount) {
  const cats = categoryColumns(profile, rowCount);
  return cats.find((c) => /region|category|product|country|segment|type|channel|department|city|name/i.test(c.name)) || cats[0] || null;
}

export function primaryDate(profile) {
  return dateColumns(profile)[0] || null;
}

/** KPI cards: only metrics that make sense for the detected columns. */
export function computeKpis(table, rows, profile) {
  const kpis = [];
  const total = rows.length;
  kpis.push({ id: 'records', label: 'Total Records', value: total, format: 'int' });

  const metric = primaryMetric(profile);
  if (metric) {
    const vals = rows.map((r) => r[metric.index]).filter((v) => typeof v === 'number');
    const sum = vals.reduce((s, v) => s + v, 0);
    const label = REVENUE_RE.test(metric.name) ? `Total ${metric.name}` : `Sum of ${metric.name}`;
    kpis.push({ id: 'sum', label, value: sum, format: 'num' });
    kpis.push({ id: 'avg', label: `Average ${metric.name}`, value: vals.length ? sum / vals.length : null, format: 'num' });
    kpis.push({ id: 'max', label: `Maximum ${metric.name}`, value: vals.length ? Math.max(...vals) : null, format: 'num' });
    kpis.push({ id: 'min', label: `Minimum ${metric.name}`, value: vals.length ? Math.min(...vals) : null, format: 'num' });

    const dc = primaryDate(profile);
    if (dc) {
      const g = growthRate(rows, dc.index, metric.index);
      if (g !== null) kpis.push({ id: 'growth', label: 'Growth Rate', value: g, format: 'pct', hint: 'Last period vs. first period' });
    }
  }

  const cust = profile.find((c) => CUSTOMER_RE.test(c.name));
  if (cust) kpis.push({ id: 'customers', label: `Unique ${cust.name}`, value: cust.unique, format: 'int' });

  const missing = profile.reduce((s, c) => s + c.missing, 0);
  const cells = total * profile.length || 1;
  kpis.push({
    id: 'missing',
    label: 'Missing Values',
    value: missing,
    format: 'int',
    hint: `${((missing / cells) * 100).toFixed(1)}% of cells`,
    tone: missing ? 'warn' : 'good',
  });
  return kpis;
}

/** Growth % between the first and last period (by month) of the metric. */
export function growthRate(rows, dateIdx, valueIdx) {
  const byMonth = new Map();
  for (const r of rows) {
    const v = r[valueIdx];
    const b = timeBucket(r[dateIdx], 'month');
    if (!b || typeof v !== 'number') continue;
    byMonth.set(b, (byMonth.get(b) || 0) + v);
  }
  const keys = [...byMonth.keys()].sort();
  if (keys.length < 2) return null;
  const first = byMonth.get(keys[0]);
  const last = byMonth.get(keys[keys.length - 1]);
  if (!first) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

/**
 * Aggregates rows for a chart.
 * @returns {{ labels: string[], series: {key,name,color?}[], data: object[] }}
 */
export function aggregateForChart(table, rows, { x, ys, agg = 'sum', groupBy = 'none', limit = 30 }) {
  const xi = table.columns.findIndex((c) => c.key === x);
  const xCol = table.columns[xi];
  const yCols = ys.map((k) => table.columns.findIndex((c) => c.key === k)).filter((i) => i >= 0);
  if (xi < 0 || !yCols.length) return { labels: [], series: [], data: [] };

  const useBucket = xCol.type === 'date' && groupBy !== 'none';
  const buckets = new Map();
  for (const r of rows) {
    const label = useBucket
      ? timeBucket(r[xi], groupBy)
      : r[xi] === null || r[xi] === undefined || r[xi] === ''
        ? '(blank)'
        : xCol.type === 'date'
          ? String(r[xi]).slice(0, 10)
          : String(r[xi]);
    if (!label) continue;
    let entry = buckets.get(label);
    if (!entry) {
      entry = { label, acc: yCols.map(() => ({ sum: 0, n: 0, min: Infinity, max: -Infinity })) };
      buckets.set(label, entry);
    }
    yCols.forEach((yi, k) => {
      const v = r[yi];
      const a = entry.acc[k];
      if (agg === 'count') {
        if (v !== null && v !== undefined && v !== '') a.n += 1;
        return;
      }
      if (typeof v !== 'number') return;
      a.sum += v;
      a.n += 1;
      a.min = Math.min(a.min, v);
      a.max = Math.max(a.max, v);
    });
  }

  const finalize = (a) => {
    if (agg === 'count') return a.n;
    if (!a.n) return 0;
    if (agg === 'sum') return a.sum;
    if (agg === 'avg') return a.sum / a.n;
    if (agg === 'min') return a.min;
    return a.max;
  };

  let entries = [...buckets.values()].map((e) => ({
    label: useBucket ? bucketDisplay(e.label, groupBy) : e.label,
    raw: e.label,
    values: e.acc.map(finalize),
  }));

  if (useBucket || xCol.type === 'date') {
    entries.sort((a, b) => (a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0));
  } else {
    entries.sort((a, b) => b.values[0] - a.values[0]);
    if (entries.length > limit) {
      const head = entries.slice(0, limit);
      const rest = entries.slice(limit);
      const other = yCols.map((_, k) => rest.reduce((s, e) => s + e.values[k], 0));
      head.push({ label: 'Other', raw: 'Other', values: other });
      entries = head;
    }
  }

  const series = ys.map((k, i) => ({ key: `s${i}`, sourceKey: k, name: table.columns.find((c) => c.key === k).name }));
  const data = entries.map((e) => {
    const row = { name: e.label };
    series.forEach((s, i) => {
      row[s.key] = Number.isFinite(e.values[i]) ? Number(e.values[i].toFixed(4)) : 0;
    });
    return row;
  });
  return { labels: entries.map((e) => e.label), series, data };
}

/** Histogram of one numeric column. */
export function histogram(table, rows, key, bins = 12) {
  const i = table.columns.findIndex((c) => c.key === key);
  const vals = rows.map((r) => r[i]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  vals.forEach((v) => {
    const b = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[b] += 1;
  });
  return counts.map((c, b) => {
    const lo = min + b * width;
    return { name: `${formatShort(lo)}–${formatShort(lo + width)}`, count: c };
  });
}

export function formatShort(n) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Scatter points (sampled to keep charts responsive). */
export function scatterPoints(table, rows, xKey, yKey, max = 1500) {
  const xi = table.columns.findIndex((c) => c.key === xKey);
  const yi = table.columns.findIndex((c) => c.key === yKey);
  const pts = [];
  for (const r of rows) {
    if (typeof r[xi] === 'number' && typeof r[yi] === 'number') pts.push({ x: r[xi], y: r[yi] });
  }
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  return Array.from({ length: max }, (_, k) => pts[Math.floor(k * step)]);
}

/** Pearson correlation between two numeric arrays of equal length (pairwise complete). */
export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0; let k = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i]; const y = ys[i];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; k += 1;
  }
  if (k < 3) return null;
  const num = k * sxy - sx * sy;
  const den = Math.sqrt((k * sxx - sx * sx) * (k * syy - sy * sy));
  if (!den) return null;
  return num / den;
}

export function correlationMatrix(table, rows, profile) {
  const nums = numericColumns(profile).slice(0, 12);
  const cols = nums.map((c) => rows.map((r) => r[c.index]));
  const matrix = nums.map((_, i) => nums.map((_, j) => (i === j ? 1 : pearson(cols[i], cols[j]))));
  return { names: nums.map((c) => c.name), matrix };
}

/** Full-table row sample for exports/previews */
export function previewRows(rows, n = 100) {
  return rows.slice(0, n);
}

/** Summary statistics per column (for download). */
export function summaryStats(profile, rows) {
  return profile.map((c) => {
    const vals = rows.map((r) => r[c.index]).filter((v) => v !== null && v !== undefined && v !== '');
    const base = { column: c.name, type: c.type, count: vals.length, missing: c.missing, unique: c.unique };
    if (c.type === 'number') {
      const nums = vals.filter((v) => typeof v === 'number').sort((a, b) => a - b);
      const mean = nums.reduce((s, v) => s + v, 0) / (nums.length || 1);
      const median = nums.length ? (nums.length % 2 ? nums[(nums.length - 1) / 2] : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2) : null;
      const sd = nums.length > 1 ? Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (nums.length - 1)) : null;
      return { ...base, min: nums[0] ?? null, max: nums[nums.length - 1] ?? null, mean: nums.length ? mean : null, median, stddev: sd };
    }
    return { ...base, min: null, max: null, mean: null, median: null, stddev: null };
  });
}

/** Tukey IQR outliers for a numeric column. */
export function outliers(rows, idx) {
  const vals = rows.map((r, i) => ({ v: r[idx], i })).filter((x) => typeof x.v === 'number').sort((a, b) => a.v - b.v);
  if (vals.length < 8) return { count: 0, low: null, high: null, examples: [] };
  const q = (p) => {
    const pos = (vals.length - 1) * p;
    const lo = Math.floor(pos);
    return vals[lo].v + (vals[Math.min(lo + 1, vals.length - 1)].v - vals[lo].v) * (pos - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  const out = vals.filter((x) => x.v < low || x.v > high);
  return { count: out.length, low, high, examples: out.slice(0, 5).map((x) => ({ row: x.i + 1, value: x.v })) };
}
