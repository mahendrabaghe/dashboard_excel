/**
 * Normalises a raw matrix (first row = header) into a typed table.
 * Used by BOTH the browser (preview) and the server (authoritative import),
 * so what the user previews is exactly what gets stored.
 */
import {
  LIMITS,
  isEmpty,
  inferColumnType,
  normalizeHeaders,
  parseNumber,
  parseDate,
  parseBoolean,
} from './dataUtils.js';

export class DataError extends Error {
  constructor(message, code = 'INVALID_DATA') {
    super(message);
    this.name = 'DataError';
    this.code = code;
  }
}

/** Convert a single raw cell to the given logical type. Returns null for empty/invalid. */
export function convertValue(value, type) {
  if (isEmpty(value)) return null;
  switch (type) {
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      const n = parseNumber(value);
      return Number.isNaN(n) ? null : n;
    }
    case 'date': {
      const d = parseDate(value);
      return d ? d.toISOString() : null;
    }
    case 'boolean':
      return parseBoolean(value);
    default:
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
      return typeof value === 'string' ? value.trim() : String(value);
  }
}

/**
 * @param {any[][]} matrix  rows of raw cell values; matrix[0] is the header row
 * @returns {{ columns: {key,name,type,missing,unique}[], rows: any[][], warnings: string[], stats: object }}
 */
export function normalizeTable(matrix, options = {}) {
  const maxRows = options.maxRows ?? LIMITS.MAX_ROWS;
  const maxCols = options.maxCols ?? LIMITS.MAX_COLS;
  const warnings = [];

  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new DataError('The file is empty.', 'EMPTY_FILE');
  }

  const isRowEmpty = (row) => !Array.isArray(row) || row.every((c) => isEmpty(c));
  const headerRow = matrix[0] || [];
  if (isRowEmpty(headerRow)) {
    throw new DataError('No header row was found. The first row must contain column names.', 'NO_HEADER');
  }

  // Keep only non-empty body rows
  let droppedEmptyRows = 0;
  const body = [];
  for (let i = 1; i < matrix.length; i += 1) {
    if (isRowEmpty(matrix[i])) {
      droppedEmptyRows += 1;
    } else {
      body.push(matrix[i]);
    }
  }
  if (body.length === 0) {
    throw new DataError('The file has a header but no data rows.', 'NO_DATA');
  }
  if (body.length > maxRows) {
    throw new DataError(
      `This dataset has ${body.length.toLocaleString()} rows. The limit is ${maxRows.toLocaleString()} rows.`,
      'ROW_LIMIT'
    );
  }

  // Determine effective width = last non-empty column across header + body
  let width = 0;
  const considerRow = (row) => {
    for (let c = row.length - 1; c >= width; c -= 1) {
      if (!isEmpty(row[c])) {
        width = c + 1;
        break;
      }
    }
  };
  considerRow(headerRow);
  body.forEach(considerRow);
  if (width === 0) throw new DataError('The file contains no values.', 'EMPTY_FILE');
  if (width > maxCols) {
    throw new DataError(
      `This dataset has ${width} columns. The limit is ${maxCols} columns.`,
      'COLUMN_LIMIT'
    );
  }

  const rawHeaders = Array.from({ length: width }, (_, i) => headerRow[i]);
  const { names, duplicates } = normalizeHeaders(rawHeaders);
  if (duplicates.length) {
    warnings.push(`Duplicate column names were renamed: ${duplicates.join(', ')}.`);
  }
  const blankHeaders = rawHeaders.filter((h) => isEmpty(h)).length;
  if (blankHeaders) warnings.push(`${blankHeaders} column(s) had no header and were auto-named.`);

  let invalidCells = 0;
  let truncatedRows = 0;
  const columns = [];
  const rows = body.map(() => new Array(width));

  for (let c = 0; c < width; c += 1) {
    const raw = body.map((r) => r[c]);
    const type = inferColumnType(raw);
    let missing = 0;
    const seen = new Set();
    for (let r = 0; r < raw.length; r += 1) {
      const original = raw[r];
      const converted = convertValue(original, type);
      if (converted === null) {
        if (!isEmpty(original)) invalidCells += 1;
        missing += 1;
      } else {
        seen.add(typeof converted === 'object' ? JSON.stringify(converted) : converted);
      }
      rows[r][c] = converted;
    }
    columns.push({
      key: `c${c}`,
      name: names[c],
      type,
      missing,
      unique: seen.size,
    });
  }

  body.forEach((r) => {
    if (r.length > width && r.slice(width).some((v) => !isEmpty(v))) truncatedRows += 1;
  });
  if (truncatedRows) warnings.push(`${truncatedRows} row(s) had extra values beyond the header and were truncated.`);
  if (invalidCells) warnings.push(`${invalidCells.toLocaleString()} cell(s) could not be read as their detected type and were set to empty.`);
  if (droppedEmptyRows) warnings.push(`${droppedEmptyRows} completely empty row(s) were skipped.`);

  const missingTotal = columns.reduce((s, c) => s + c.missing, 0);
  if (missingTotal > 0) {
    warnings.push(`${missingTotal.toLocaleString()} missing value(s) detected.`);
  }

  return {
    columns,
    rows,
    warnings,
    stats: {
      rowCount: rows.length,
      columnCount: columns.length,
      droppedEmptyRows,
      invalidCells,
      duplicateHeaders: duplicates,
      missingTotal,
    },
  };
}
