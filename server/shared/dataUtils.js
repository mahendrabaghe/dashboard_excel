/**
 * Shared, dependency-free data utilities used by BOTH the client and the server.
 * Keeping type inference in one place guarantees the browser preview and the
 * server-side import agree on column types.
 */

export const LIMITS = Object.freeze({
  MAX_FILE_BYTES: 10 * 1024 * 1024, // 10 MB upload limit
  MAX_ROWS: 200000, // practical row limit per dataset
  MAX_COLS: 200, // practical column limit per dataset
  CHUNK_SIZE: 1000, // rows per MongoDB chunk document
  MAX_TRANSFORMATIONS: 2000,
  MAX_PAGE_ROWS: 5000,
});

export const ALLOWED_EXTENSIONS = ['csv', 'xlsx', 'xls'];

export const COLUMN_TYPES = ['text', 'number', 'date', 'boolean'];

export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return !Number.isFinite(value);
  return false;
}

const NUMERIC_RE = /^[-+(]?\s*[$€£¥]?\s*[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?\s*%?\)?$/;

/** Parses numbers such as "1,234.5", "$2,000", "(45)", "12%" -> number | NaN */
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const s = value.trim();
  if (!s || !NUMERIC_RE.test(s)) return NaN;
  const negative = s.startsWith('(') && s.endsWith(')');
  const cleaned = s.replace(/[,$€£¥%()\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

const DATE_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}([T ].*)?$/, // 2024-01-31 / ISO
  /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/, // 31/01/2024, 1-31-24
  /^[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}$/, // Jan 31, 2024
  /^\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4}$/, // 31 January 2024
];

/** Parses dates -> Date | null (invalid) */
export function parseDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!DATE_PATTERNS.some((re) => re.test(s))) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  // Handle dd/mm/yyyy style when the native parser fails
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const alt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(alt.getTime())) return alt;
  }
  return null;
}

const TRUE_VALUES = new Set(['true', 'yes', 'y', 't']);
const FALSE_VALUES = new Set(['false', 'no', 'n', 'f']);

export function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  if (TRUE_VALUES.has(s)) return true;
  if (FALSE_VALUES.has(s)) return false;
  return null;
}

/**
 * Infers the logical type of a column from its values.
 * Returns 'number' | 'date' | 'boolean' | 'text' (or 'text' for all-empty columns).
 */
export function inferColumnType(values, sampleSize = 2000) {
  let total = 0;
  let numbers = 0;
  let dates = 0;
  let booleans = 0;
  const step = Math.max(1, Math.floor(values.length / sampleSize));
  for (let i = 0; i < values.length; i += step) {
    const v = values[i];
    if (isEmpty(v)) continue;
    total += 1;
    if (typeof v === 'boolean') {
      booleans += 1;
      continue;
    }
    if (typeof v === 'number') {
      if (Number.isFinite(v)) numbers += 1;
      continue;
    }
    if (parseBoolean(v) !== null && typeof v === 'string' && !/^\d/.test(v.trim())) booleans += 1;
    if (!Number.isNaN(parseNumber(v))) numbers += 1;
    if (parseDate(v)) dates += 1;
  }
  if (total === 0) return 'text';
  const threshold = 0.9;
  if (booleans / total >= threshold && numbers / total < threshold) return 'boolean';
  if (numbers / total >= threshold) return 'number';
  if (dates / total >= threshold) return 'date';
  return 'text';
}

/**
 * Normalises header names: trims, fills empty names, and de-duplicates
 * repeated names by appending " (2)", " (3)", ...
 */
export function normalizeHeaders(rawHeaders) {
  const seen = new Map();
  const duplicates = [];
  const names = rawHeaders.map((h, i) => {
    let base = h === null || h === undefined ? '' : String(h).trim().replace(/\s+/g, ' ');
    if (!base) base = `Column ${i + 1}`;
    const count = seen.get(base.toLowerCase()) || 0;
    seen.set(base.toLowerCase(), count + 1);
    if (count === 0) return base;
    duplicates.push(base);
    return `${base} (${count + 1})`;
  });
  return { names, duplicates };
}

/** Format a number for display (thousands separators, max 2 decimals) */
export function formatNumber(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Parse the output of a file size in bytes into a human string */
export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
