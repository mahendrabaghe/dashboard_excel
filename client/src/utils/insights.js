/**
 * Local statistical insights. Every statement is computed from the real working table.
 * Used when no external AI provider is configured, and as the grounding summary for AI answers.
 */
import {
  numericColumns,
  dateColumns,
  categoryColumns,
  primaryMetric,
  primaryCategory,
  primaryDate,
  aggregateForChart,
  correlationMatrix,
  outliers,
  growthRate,
  computeKpis,
  summaryStats,
  formatShort,
  timeBucket,
  bucketDisplay,
} from './analytics.js';
import { filterIndices } from './filters.js';

const f = (n, d = 1) => (Number.isFinite(n) ? formatShort(Number(n.toFixed(d))) : '—');

export function buildInsights(table, rows, profile) {
  const insights = { summary: [], trends: [], rankings: [], outliers: [], correlations: [], quality: [], suggestions: [], recommendations: [] };
  const n = rows.length;
  const nums = numericColumns(profile);
  const metric = primaryMetric(profile);
  const cat = primaryCategory(profile, n);
  const dateCol = primaryDate(profile);

  insights.summary.push(`${n.toLocaleString()} records and ${table.columns.length} columns (${nums.length} numeric, ${dateColumns(profile).length} date, ${categoryColumns(profile, n).length} category-like).`);
  if (metric) {
    const vals = rows.map((r) => r[metric.index]).filter((v) => typeof v === 'number');
    const sum = vals.reduce((s, v) => s + v, 0);
    insights.summary.push(`${metric.name}: total ${f(sum)}, average ${f(sum / (vals.length || 1))}, range ${f(Math.min(...vals))} to ${f(Math.max(...vals))}.`);
  }

  // Trends
  if (dateCol && metric) {
    const series = aggregateForChart(table, rows, { x: dateCol.key, ys: [metric.key], agg: 'sum', groupBy: 'month', limit: 500 });
    const g = growthRate(rows, dateCol.index, metric.index);
    if (series.data.length >= 2) {
      const first = series.data[0];
      const last = series.data[series.data.length - 1];
      const s0 = first[series.series[0].key];
      const s1 = last[series.series[0].key];
      insights.trends.push(`${metric.name} moved from ${f(s0)} in ${first.name} to ${f(s1)} in ${last.name}${g !== null ? ` (${g >= 0 ? '+' : ''}${g.toFixed(1)}%)` : ''}.`);
      const peak = series.data.reduce((a, b) => (b[series.series[0].key] > a[series.series[0].key] ? b : a));
      const low = series.data.reduce((a, b) => (b[series.series[0].key] < a[series.series[0].key] ? b : a));
      insights.trends.push(`Peak period: ${peak.name} (${f(peak[series.series[0].key])}). Lowest period: ${low.name} (${f(low[series.series[0].key])}).`);
    }
  }

  // Rankings
  if (cat && metric) {
    const agg = aggregateForChart(table, rows, { x: cat.key, ys: [metric.key], agg: 'sum', limit: 1000 });
    const sorted = [...agg.data].sort((a, b) => b[agg.series[0].key] - a[agg.series[0].key]);
    if (sorted.length) {
      const k = agg.series[0].key;
      const total = sorted.reduce((s, r) => s + r[k], 0) || 1;
      insights.rankings.push(`Highest ${cat.name}: ${sorted[0].name} with ${f(sorted[0][k])} (${((sorted[0][k] / total) * 100).toFixed(1)}% of total ${metric.name}).`);
      const last = sorted[sorted.length - 1];
      insights.rankings.push(`Lowest ${cat.name}: ${last.name} with ${f(last[k])} (${((last[k] / total) * 100).toFixed(1)}%).`);
      if (sorted.length >= 3) {
        const top3 = sorted.slice(0, 3).reduce((s, r) => s + r[k], 0);
        insights.rankings.push(`The top 3 ${cat.name} values account for ${((top3 / total) * 100).toFixed(1)}% of ${metric.name}.`);
      }
    }
  }

  // Outliers
  nums.slice(0, 8).forEach((c) => {
    const o = outliers(rows, c.index);
    if (o.count > 0) {
      const pct = ((o.count / n) * 100).toFixed(1);
      insights.outliers.push(`${c.name}: ${o.count} potential outlier(s) (${pct}%) outside ${f(o.low, 2)} – ${f(o.high, 2)} (IQR rule). Example at row ${o.examples[0].row}: ${f(o.examples[0].value, 2)}.`);
    }
  });
  if (!insights.outliers.length) insights.outliers.push('No statistically unusual numeric values were detected (IQR rule).');

  // Correlations
  if (nums.length >= 2) {
    const { names, matrix } = correlationMatrix(table, rows, profile);
    const pairs = [];
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        if (matrix[i][j] !== null) pairs.push({ a: names[i], b: names[j], r: matrix[i][j] });
      }
    }
    pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    pairs.slice(0, 5).forEach((p) => {
      const strength = Math.abs(p.r) >= 0.7 ? 'strong' : Math.abs(p.r) >= 0.4 ? 'moderate' : 'weak';
      insights.correlations.push(`${p.a} and ${p.b}: r = ${p.r.toFixed(2)} (${strength} ${p.r >= 0 ? 'positive' : 'negative'} correlation).`);
    });
    if (!pairs.length) insights.correlations.push('Not enough overlapping numeric values to compute correlations.');
  } else {
    insights.correlations.push('Correlation analysis needs at least two numeric columns.');
  }

  // Quality
  const totalCells = n * table.columns.length || 1;
  const missingTotal = profile.reduce((s, c) => s + c.missing, 0);
  if (missingTotal) {
    const worst = [...profile].sort((a, b) => b.missing - a.missing)[0];
    insights.quality.push(`${missingTotal.toLocaleString()} missing cell(s) (${((missingTotal / totalCells) * 100).toFixed(1)}%). Most affected: "${worst.name}" (${worst.missing}).`);
  } else {
    insights.quality.push('No missing values in the working dataset.');
  }
  profile.forEach((c) => {
    if (c.unique === n && n > 20 && c.type === 'text') insights.quality.push(`"${c.name}" has all unique values (possible identifier, not a category).`);
    if (c.unique === 1 && n > 1) insights.quality.push(`"${c.name}" has a single constant value and adds no analytical information.`);
  });
  const dup = duplicateCount(rows);
  if (dup) insights.quality.push(`${dup} fully duplicated row(s) detected. Use Data Explorer → Remove duplicates.`);

  // Suggestions
  if (metric) insights.suggestions.push(`KPI: total and average of ${metric.name}`);
  if (dateCol && metric) insights.suggestions.push(`Line or area chart of ${metric.name} by month`);
  if (cat && metric) insights.suggestions.push(`Bar chart of ${metric.name} by ${cat.name}`);
  if (nums.length >= 2) insights.suggestions.push('Scatter plot or correlation heatmap for numeric relationships');
  if (nums.length) insights.suggestions.push(`Histogram of ${nums[0].name} to see its distribution`);

  // Recommendations
  if (insights.rankings.length) insights.recommendations.push('Focus effort on the highest-performing category and investigate why the lowest one underperforms.');
  if (insights.trends.length) insights.recommendations.push('Review the periods with the lowest totals to identify seasonality or operational issues.');
  if (insights.outliers.some((s) => !s.startsWith('No '))) insights.recommendations.push('Verify flagged outliers against source systems before drawing conclusions from averages.');
  if (missingTotal) insights.recommendations.push('Resolve missing values (fill or remove) in Data Explorer before reporting totals.');
  if (!insights.recommendations.length) insights.recommendations.push('Dataset looks clean; build a dashboard to monitor the key metrics over time.');
  return insights;
}

function duplicateCount(rows) {
  const seen = new Set();
  let d = 0;
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (seen.has(k)) d += 1;
    else seen.add(k);
  }
  return d;
}

/**
 * Answers natural-language questions from the actual data.
 * Returns { answer, bullets }. Deterministic: uses only computed statistics.
 */
export function answerQuestion(question, table, rows, profile) {
  const q = question.toLowerCase();
  const n = rows.length;
  const metric = primaryMetric(profile);
  const cat = primaryCategory(profile, n);
  const dateCol = primaryDate(profile);
  const nums = numericColumns(profile);

  const mentionedMetric = profile.find((c) => c.type === 'number' && q.includes(c.name.toLowerCase())) || metric;
  const mentionedCat = profile.find((c) => c.type === 'text' && q.includes(c.name.toLowerCase())) || cat;

  if (/trend|over time|changed|growth|time|monthly|quarter|year/.test(q)) {
    if (!dateCol || !mentionedMetric) return { answer: 'This dataset has no date column paired with a numeric metric, so a time trend cannot be computed.', bullets: [] };
    const s = aggregateForChart(table, rows, { x: dateCol.key, ys: [mentionedMetric.key], agg: 'sum', groupBy: /quarter/.test(q) ? 'quarter' : /year/.test(q) ? 'year' : 'month', limit: 500 });
    const k = s.series[0].key;
    if (s.data.length < 2) return { answer: 'Not enough dated periods to describe a trend.', bullets: [] };
    const g = growthRate(rows, dateCol.index, mentionedMetric.index);
    return {
      answer: `${mentionedMetric.name} changed from ${f(s.data[0][k])} (${s.data[0].name}) to ${f(s.data[s.data.length - 1][k])} (${s.data[s.data.length - 1].name})${g !== null ? `, a ${g >= 0 ? 'rise' : 'fall'} of ${Math.abs(g).toFixed(1)}%` : ''}.`,
      bullets: s.data.slice(-6).map((r) => `${r.name}: ${f(r[k])}`),
    };
  }

  if (/highest|top|best|most|maximum|largest/.test(q) || /lowest|worst|least|bottom|smallest|minimum/.test(q)) {
    if (!mentionedCat || !mentionedMetric) return { answer: 'Need a category column and a numeric column to rank.', bullets: [] };
    const s = aggregateForChart(table, rows, { x: mentionedCat.key, ys: [mentionedMetric.key], agg: 'sum', limit: 1000 });
    const k = s.series[0].key;
    const sorted = [...s.data].sort((a, b) => b[k] - a[k]);
    const wantLow = /lowest|worst|least|bottom|smallest|minimum/.test(q) && !/highest|top|best/.test(q);
    const pick = wantLow ? sorted[sorted.length - 1] : sorted[0];
    return {
      answer: `${pick.name} has the ${wantLow ? 'lowest' : 'highest'} total ${mentionedMetric.name} in ${mentionedCat.name} with ${f(pick[k])}.`,
      bullets: sorted.slice(0, 5).map((r) => `${r.name}: ${f(r[k])}`),
    };
  }

  if (/outlier|unusual|anomal|strange|odd/.test(q)) {
    const lines = nums.map((c) => ({ c, o: outliers(rows, c.index) })).filter((x) => x.o.count);
    if (!lines.length) return { answer: 'No unusual numeric values were found using the IQR rule.', bullets: [] };
    return {
      answer: `Found unusual values in ${lines.length} numeric column(s).`,
      bullets: lines.map(({ c, o }) => `${c.name}: ${o.count} outlier(s), e.g. row ${o.examples[0].row} = ${f(o.examples[0].value, 2)}`),
    };
  }

  if (/correlat|relationship|related|linked|depend/.test(q)) {
    if (nums.length < 2) return { answer: 'Fewer than two numeric columns, so no correlation can be computed.', bullets: [] };
    const { names, matrix } = correlationMatrix(table, rows, profile);
    const pairs = [];
    names.forEach((a, i) => names.forEach((b, j) => { if (j > i && matrix[i][j] !== null) pairs.push({ a, b, r: matrix[i][j] }); }));
    pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    return {
      answer: pairs.length ? `The strongest relationship is between ${pairs[0].a} and ${pairs[0].b} (r = ${pairs[0].r.toFixed(2)}).` : 'No computable correlations.',
      bullets: pairs.slice(0, 5).map((p) => `${p.a} ↔ ${p.b}: r = ${p.r.toFixed(2)}`),
    };
  }

  if (/average|mean|typical/.test(q) && mentionedMetric) {
    const vals = rows.map((r) => r[mentionedMetric.index]).filter((v) => typeof v === 'number');
    return { answer: `The average ${mentionedMetric.name} is ${f(vals.reduce((s, v) => s + v, 0) / (vals.length || 1), 2)} across ${vals.length.toLocaleString()} values.`, bullets: [] };
  }

  if (/total|sum|overall/.test(q) && mentionedMetric) {
    const vals = rows.map((r) => r[mentionedMetric.index]).filter((v) => typeof v === 'number');
    return { answer: `The total ${mentionedMetric.name} is ${f(vals.reduce((s, v) => s + v, 0), 2)}.`, bullets: [] };
  }

  if (/how many|count|records|rows/.test(q)) {
    return { answer: `There are ${n.toLocaleString()} records in the working dataset.`, bullets: mentionedCat ? [`Distinct ${mentionedCat.name}: ${mentionedCat.unique}`] : [] };
  }

  if (/missing|quality|empty|null/.test(q)) {
    const miss = profile.filter((c) => c.missing).map((c) => `${c.name}: ${c.missing} missing`);
    return { answer: miss.length ? 'Missing values were found in these columns.' : 'No missing values in the dataset.', bullets: miss };
  }

  // Fallback: a grounded overview
  const ins = buildInsights(table, rows, profile);
  return { answer: 'Here is a summary based on the data. Try asking about trends, the highest or lowest category, outliers or correlations.', bullets: [...ins.summary, ...ins.rankings.slice(0, 2)] };
}

/** Compact, aggregate-only summary sent to the optional AI endpoint (never raw rows). */
export function buildAiSummary(table, rows, profile) {
  return {
    rowCount: rows.length,
    columns: profile.map((c) => ({ name: c.name, type: c.type, missing: c.missing, unique: c.unique, min: c.min, max: c.max, mean: c.mean })),
    stats: summaryStats(profile, rows).slice(0, 30),
    kpis: computeKpis(table, rows, profile).map((k) => ({ label: k.label, value: k.value })),
    correlations: nums2(table, rows, profile),
  };
}

function nums2(table, rows, profile) {
  const nums = numericColumns(profile);
  if (nums.length < 2) return [];
  const { names, matrix } = correlationMatrix(table, rows, profile);
  const out = [];
  names.forEach((a, i) => names.forEach((b, j) => { if (j > i && matrix[i][j] !== null) out.push({ a, b, r: Number(matrix[i][j].toFixed(3)) }); }));
  return out.slice(0, 20);
}

export { filterIndices, timeBucket, bucketDisplay };
