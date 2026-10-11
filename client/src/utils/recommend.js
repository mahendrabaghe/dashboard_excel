/**
 * Auto-generates dashboard widgets from detected column types.
 * Only suggests visuals that the data actually supports.
 */
import { uid } from '../lib/utils.js';
import {
  numericColumns,
  dateColumns,
  categoryColumns,
  primaryMetric,
  primaryCategory,
  primaryDate,
  computeKpis,
} from './analytics.js';

export const CHART_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'stacked', label: 'Stacked bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'histogram', label: 'Histogram' },
  { value: 'heatmap', label: 'Correlation heatmap' },
  { value: 'table', label: 'Table' },
];

export function defaultChartConfig(overrides = {}) {
  return {
    chartType: 'bar',
    x: null,
    ys: [],
    agg: 'sum',
    groupBy: 'none',
    limit: 15,
    filter: { logic: 'AND', groups: [] },
    showLegend: true,
    showGrid: true,
    showLabels: false,
    showTooltip: true,
    ...overrides,
  };
}

export function makeChartWidget(title, description, config, layout) {
  return {
    id: uid('chart'),
    type: 'chart',
    title,
    description,
    config: defaultChartConfig(config),
    layout: { x: 0, y: 0, w: 6, h: 4, ...layout },
  };
}

export function makeKpiWidget(kpi, layout) {
  return {
    id: uid('kpi'),
    type: 'kpi',
    title: kpi.label,
    description: kpi.hint || '',
    config: { kpiId: kpi.id, label: kpi.label, format: kpi.format },
    layout: { x: 0, y: 0, w: 3, h: 2, ...layout },
  };
}

export function makeWidget(type, extra = {}) {
  const base = {
    kpi: { w: 3, h: 2, title: 'KPI', config: { agg: 'sum', key: null, label: 'KPI' } },
    chart: { w: 6, h: 4, title: 'Chart', config: defaultChartConfig() },
    table: { w: 12, h: 5, title: 'Data table', config: { columns: [], limit: 50 } },
    text: { w: 4, h: 2, title: 'Notes', config: { text: 'Add your notes here.' } },
    filter: { w: 3, h: 2, title: 'Filter', config: { key: null, op: 'in', value: [] } },
  }[type];
  return {
    id: uid(type),
    type,
    title: extra.title ?? base.title,
    description: extra.description ?? '',
    config: { ...base.config, ...(extra.config || {}) },
    layout: { x: 0, y: 0, w: base.w, h: base.h, ...(extra.layout || {}) },
  };
}

/** Builds the recommended set of widgets for a profiled dataset. */
export function recommendWidgets(table, rows, profile) {
  const widgets = [];
  const nums = numericColumns(profile);
  const dates = dateColumns(profile);
  const cats = categoryColumns(profile, rows.length);
  const metric = primaryMetric(profile);
  const cat = primaryCategory(profile, rows.length);
  const dateCol = primaryDate(profile);

  // KPI row
  computeKpis(table, rows, profile)
    .slice(0, 4)
    .forEach((k) => widgets.push(makeKpiWidget(k, { w: 3, h: 2 })));

  if (dateCol && metric) {
    widgets.push(
      makeChartWidget(
        `${metric.name} over time`,
        'Monthly trend of the primary metric',
        { chartType: 'area', x: dateCol.key, ys: [metric.key], agg: 'sum', groupBy: 'month' },
        { w: 12, h: 4 }
      )
    );
  }
  if (cat && metric) {
    widgets.push(
      makeChartWidget(
        `${metric.name} by ${cat.name}`,
        'Top categories ranked by the primary metric',
        { chartType: 'bar', x: cat.key, ys: [metric.key], agg: 'sum', limit: 12 },
        { w: 6, h: 4 }
      )
    );
    if (cat.unique <= 8) {
      widgets.push(
        makeChartWidget(
          `Share of ${metric.name} by ${cat.name}`,
          'Proportion of each category',
          { chartType: 'donut', x: cat.key, ys: [metric.key], agg: 'sum', limit: 8 },
          { w: 6, h: 4 }
        )
      );
    }
  }
  if (cat && nums.length >= 2) {
    widgets.push(
      makeChartWidget(
        `${cat.name} comparison`,
        'Multiple numeric measures per category',
        { chartType: 'stacked', x: cat.key, ys: nums.slice(0, 3).map((n) => n.key), agg: 'avg', limit: 12 },
        { w: 6, h: 4 }
      )
    );
  }
  nums.slice(0, 2).forEach((n) => {
    widgets.push(
      makeChartWidget(`Distribution of ${n.name}`, 'How values are spread across ranges', { chartType: 'histogram', x: n.key, ys: [n.key] }, { w: 4, h: 4 })
    );
  });
  if (nums.length >= 2) {
    widgets.push(
      makeChartWidget(
        `${nums[0].name} vs ${nums[1].name}`,
        'Relationship between two numeric variables',
        { chartType: 'scatter', x: nums[0].key, ys: [nums[1].key] },
        { w: 4, h: 4 }
      )
    );
  }
  if (nums.length >= 3) {
    widgets.push(
      makeChartWidget('Correlation heatmap', 'Pearson correlation between numeric columns', { chartType: 'heatmap', ys: nums.slice(0, 8).map((n) => n.key) }, { w: 4, h: 4 })
    );
  }
  if (!widgets.some((w) => w.type === 'chart') && cats.length) {
    widgets.push(makeChartWidget(`Records by ${cats[0].name}`, 'Row count per category', { chartType: 'bar', x: cats[0].key, ys: [], agg: 'count', limit: 12 }, { w: 6, h: 4 }));
  }
  widgets.push({
    id: uid('table'),
    type: 'table',
    title: 'Data preview',
    description: 'First rows of the cleaned dataset',
    config: { columns: table.columns.map((c) => c.key).slice(0, 10), limit: 50 },
    layout: { x: 0, y: 0, w: 12, h: 5 },
  });
  return placeWidgets(widgets);
}

/** Simple top-to-bottom packing on the 12-column grid, respecting widths. */
export function placeWidgets(widgets) {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return widgets.map((w) => {
    const { w: ww, h } = w.layout;
    if (x + ww > 12) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const placed = { ...w, layout: { ...w.layout, x, y } };
    x += ww;
    rowH = Math.max(rowH, h);
    return placed;
  });
}
