/**
 * Reusable filter engine.
 *
 * Filter shape:
 *   { logic: 'AND' | 'OR',               // combines groups
 *     groups: [{ logic: 'AND'|'OR', conditions: [{ key, op, value, value2 }] }] }
 *
 * Operators: eq, neq, contains, gt, gte, lt, lte, between, in, is_empty, not_empty
 */
import { parseDate, parseNumber } from '@shared/dataUtils.js';

export const EMPTY_FILTER = Object.freeze({ logic: 'AND', groups: [] });

export const OPERATORS = {
  text: [
    ['eq', 'equals'], ['neq', 'does not equal'], ['contains', 'contains'], ['in', 'is one of'],
    ['is_empty', 'is empty'], ['not_empty', 'is not empty'],
  ],
  number: [
    ['eq', '='], ['neq', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'],
    ['between', 'between'], ['is_empty', 'is empty'], ['not_empty', 'is not empty'],
  ],
  date: [
    ['eq', 'on'], ['gt', 'after'], ['lt', 'before'], ['between', 'between (range)'],
    ['is_empty', 'is empty'], ['not_empty', 'is not empty'],
  ],
  boolean: [['eq', 'is'], ['is_empty', 'is empty'], ['not_empty', 'is not empty']],
};

const isMissing = (v) => v === null || v === undefined || v === '';

function toComparable(type, v) {
  if (type === 'number') return typeof v === 'number' ? v : parseNumber(v);
  if (type === 'date') {
    const d = parseDate(v);
    return d ? d.getTime() : NaN;
  }
  return String(v).toLowerCase();
}

export function matchCondition(row, cond, col) {
  if (!col) return true;
  const raw = row[col.index];
  const { op } = cond;
  if (op === 'is_empty') return isMissing(raw);
  if (op === 'not_empty') return !isMissing(raw);
  if (isMissing(raw)) return false;

  if (col.type === 'boolean') {
    const want = String(cond.value).toLowerCase() === 'true';
    return op === 'neq' ? raw !== want : raw === want;
  }
  if (op === 'in') {
    const set = new Set((Array.isArray(cond.value) ? cond.value : []).map(String));
    return set.has(String(raw));
  }
  if (op === 'contains') {
    return String(raw).toLowerCase().includes(String(cond.value ?? '').toLowerCase());
  }

  const a = toComparable(col.type, raw);
  if (col.type !== 'text' && Number.isNaN(a)) return false;
  if (op === 'between') {
    const lo = toComparable(col.type, cond.value);
    const hi = toComparable(col.type, cond.value2);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return true; // incomplete range: do not filter
    return a >= Math.min(lo, hi) && a <= Math.max(lo, hi);
  }
  const b = toComparable(col.type, cond.value);
  if (b === '' || (typeof b === 'number' && Number.isNaN(b))) return true; // empty value: no-op
  switch (op) {
    case 'eq': return a === b;
    case 'neq': return a !== b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    default: return true;
  }
}

/**
 * Returns the indices (into table.rows) of rows that match the filter.
 * Indices let the Explorer map view rows back to working-table rows for edits.
 * @param {{columns: any[], rows: any[][]}} table
 */
export function filterIndices(table, filter) {
  const groups = (filter?.groups || []).filter((g) => g.conditions?.length);
  const all = () => table.rows.map((_, i) => i);
  if (!groups.length) return all();
  const colMap = table.columns.map((c, index) => ({ ...c, index }));
  const byKey = new Map(colMap.map((c) => [c.key, c]));
  const compiled = groups
    .map((g) => ({
      logic: g.logic === 'OR' ? 'OR' : 'AND',
      conds: g.conditions.filter((c) => byKey.has(c.key)).map((c) => ({ cond: c, col: byKey.get(c.key) })),
    }))
    .filter((g) => g.conds.length);
  if (!compiled.length) return all();

  const out = [];
  table.rows.forEach((row, i) => {
    const results = compiled.map((g) =>
      g.logic === 'OR'
        ? g.conds.some(({ cond, col }) => matchCondition(row, cond, col))
        : g.conds.every(({ cond, col }) => matchCondition(row, cond, col))
    );
    if (filter.logic === 'OR' ? results.some(Boolean) : results.every(Boolean)) out.push(i);
  });
  return out;
}

/** Returns the rows that match the filter. */
export function applyFilter(table, filter) {
  const idx = filterIndices(table, filter);
  if (idx.length === table.rows.length) return table.rows;
  return idx.map((i) => table.rows[i]);
}

export function countActiveConditions(filter) {
  return (filter?.groups || []).reduce((s, g) => s + (g.conditions?.length || 0), 0);
}

/** Human-readable summary of a filter, e.g. "Region = North AND Revenue > 100" */
export function describeFilter(filter, columns) {
  const name = (k) => columns.find((c) => c.key === k)?.name || k;
  const parts = (filter?.groups || [])
    .filter((g) => g.conditions?.length)
    .map((g) =>
      '(' +
      g.conditions
        .map((c) => {
          const v = Array.isArray(c.value) ? c.value.join('/') : c.value;
          const opLabel = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'contains', in: 'in', between: 'between', is_empty: 'is empty', not_empty: 'is not empty' }[c.op] || c.op;
          if (c.op === 'is_empty' || c.op === 'not_empty') return `${name(c.key)} ${opLabel}`;
          if (c.op === 'between') return `${name(c.key)} between ${v} and ${c.value2}`;
          return `${name(c.key)} ${opLabel} ${v}`;
        })
        .join(` ${g.logic || 'AND'} `) +
      ')'
    );
  return parts.join(` ${filter?.logic || 'AND'} `);
}
