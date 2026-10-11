/**
 * Cleaning operations as an ordered, persisted log.
 *
 * The raw imported table is never mutated. The working table is produced by
 * replaying the operation log over a clone of the raw table. Undo = drop the
 * last operation, redo = re-append it, reset = clear the log.
 */
import { convertValue, DataError } from '@shared/parseTable.js';
import { isEmpty, inferColumnType } from '@shared/dataUtils.js';
import { compileExpression } from '@shared/expressions.js';

const isMissing = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export const OPERATION_LABELS = {
  set_cell: 'Edit cell',
  add_row: 'Add row',
  delete_row: 'Delete row',
  add_column: 'Add column',
  delete_column: 'Delete column',
  rename_column: 'Rename column',
  convert_type: 'Convert type',
  delete_missing_rows: 'Remove rows with missing values',
  fill_missing: 'Fill missing values',
  find_replace: 'Find & replace',
  dedupe: 'Remove duplicate rows',
  calc_column: 'Calculated column',
};

/** Returns a deep-enough copy of the raw table so ops can mutate freely. */
export function cloneTable(raw) {
  return {
    columns: raw.columns.map((c) => ({ ...c })),
    rows: raw.rows.map((r) => r.slice()),
  };
}

const colIndex = (table, key) => table.columns.findIndex((c) => c.key === key);

function numericValues(table, idx) {
  const out = [];
  for (const r of table.rows) {
    const v = r[idx];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function mode(values) {
  const counts = new Map();
  let best = null;
  let bestCount = 0;
  for (const v of values) {
    if (isMissing(v)) continue;
    const k = typeof v === 'object' ? JSON.stringify(v) : v;
    const c = (counts.get(k) || 0) + 1;
    counts.set(k, c);
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

/** Applies ONE operation to a working table, mutating it in place. */
export function applyOperation(table, op) {
  const p = op.params || {};
  switch (op.operation) {
    case 'rename_column': {
      const i = colIndex(table, p.key);
      if (i < 0) return;
      table.columns[i].name = String(p.name).trim() || table.columns[i].name;
      return;
    }
    case 'delete_column': {
      const i = colIndex(table, p.key);
      if (i < 0) return;
      table.columns.splice(i, 1);
      table.rows.forEach((r) => r.splice(i, 1));
      return;
    }
    case 'add_column': {
      table.columns.push({ key: p.key, name: p.name, type: p.type || 'text', missing: 0, unique: 0 });
      const v = p.value ?? null;
      table.rows.forEach((r) => r.push(v));
      return;
    }
    case 'add_row': {
      table.rows.push(new Array(table.columns.length).fill(null));
      return;
    }
    case 'delete_row': {
      if (p.index >= 0 && p.index < table.rows.length) table.rows.splice(p.index, 1);
      return;
    }
    case 'set_cell': {
      const i = colIndex(table, p.key);
      if (i < 0 || p.row < 0 || p.row >= table.rows.length) return;
      table.rows[p.row][i] = p.value;
      return;
    }
    case 'convert_type': {
      const i = colIndex(table, p.key);
      if (i < 0) return;
      const type = p.type;
      table.rows.forEach((r) => {
        r[i] = convertValue(r[i], type);
      });
      table.columns[i].type = type;
      return;
    }
    case 'delete_missing_rows': {
      const idx = p.key ? [colIndex(table, p.key)] : table.columns.map((_, i) => i);
      table.rows = table.rows.filter((r) => !idx.some((i) => i >= 0 && isMissing(r[i])));
      return;
    }
    case 'fill_missing': {
      const i = colIndex(table, p.key);
      if (i < 0) return;
      const col = table.columns[i];
      let fill = null;
      if (p.mode === 'value') {
        fill = convertValue(p.value, col.type);
      } else if (col.type === 'number') {
        const vals = numericValues(table, i).sort((a, b) => a - b);
        if (!vals.length) return;
        if (p.mode === 'mean') fill = vals.reduce((s, v) => s + v, 0) / vals.length;
        else if (p.mode === 'median') {
          const m = Math.floor(vals.length / 2);
          fill = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
        }
      }
      if (p.mode === 'mode') fill = mode(table.rows.map((r) => r[i]));
      if (fill === null || fill === undefined) return;
      table.rows.forEach((r) => {
        if (isMissing(r[i])) r[i] = fill;
      });
      return;
    }
    case 'dedupe': {
      const idx = p.keys && p.keys.length ? p.keys.map((k) => colIndex(table, k)).filter((i) => i >= 0) : table.columns.map((_, i) => i);
      const seen = new Set();
      table.rows = table.rows.filter((r) => {
        const sig = JSON.stringify(idx.map((i) => r[i]));
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
      });
      return;
    }
    case 'find_replace': {
      const find = String(p.find ?? '');
      if (!find) return;
      const targets = p.key ? [colIndex(table, p.key)] : table.columns.map((_, i) => i);
      const norm = (s) => (p.matchCase ? s : s.toLowerCase());
      const target = norm(find);
      targets.forEach((i) => {
        if (i < 0) return;
        const col = table.columns[i];
        table.rows.forEach((r) => {
          const v = r[i];
          if (isMissing(v)) return;
          const s = String(v);
          const hit = p.wholeCell ? norm(s) === target : norm(s).includes(target);
          if (!hit) return;
          if (col.type === 'text') {
            if (p.wholeCell) r[i] = String(p.replace ?? '');
            else {
              const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), p.matchCase ? 'g' : 'gi');
              r[i] = s.replace(re, String(p.replace ?? ''));
            }
          } else {
            const nv = convertValue(p.replace, col.type);
            if (nv !== null) r[i] = nv;
          }
        });
      });
      return;
    }
    case 'calc_column': {
      const names = table.columns.map((c) => c.name);
      const compiled = compileExpression(p.expression, names);
      const nameToIdx = new Map(names.map((n, i) => [n, i]));
      const newVals = table.rows.map((r) => {
        const get = (n) => r[nameToIdx.get(n)];
        return compiled.evaluate(get);
      });
      table.columns.push({ key: p.key, name: p.name, type: 'number', missing: 0, unique: 0 });
      table.rows.forEach((r, k) => r.push(newVals[k]));
      return;
    }
    default:
      return;
  }
}

/** Replays a list of operations over the raw table. */
export function replay(raw, ops) {
  const table = cloneTable(raw);
  for (const op of ops) {
    try {
      applyOperation(table, op);
    } catch {
      // A failing historic op is skipped rather than breaking the whole dataset
    }
  }
  return table;
}

/* ----- Operation builders with validation (throws DataError for user-facing messages) ----- */

export function opSetCell(table, rowIdx, key, rawValue) {
  const col = table.columns.find((c) => c.key === key);
  if (!col) throw new DataError('Column not found.');
  const value = isEmpty(rawValue) ? null : convertValue(rawValue, col.type);
  if (value === null && !isEmpty(rawValue)) {
    throw new DataError(`"${rawValue}" is not a valid ${col.type} value.`);
  }
  return { operation: 'set_cell', params: { row: rowIdx, key, value }, description: `Edit cell in "${col.name}"` };
}

export function opCalcColumn(table, name, expression) {
  const names = table.columns.map((c) => c.name);
  if (!name?.trim()) throw new DataError('Give the new column a name.');
  if (names.includes(name.trim())) throw new DataError('A column with this name already exists.');
  compileExpression(expression, names); // throws on invalid expression
  return {
    operation: 'calc_column',
    params: { key: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), expression },
    description: `Calculated column "${name.trim()}" = ${expression}`,
  };
}

export function opRenameColumn(table, key, name) {
  const clean = name.trim();
  if (!clean) throw new DataError('Column name cannot be empty.');
  if (table.columns.some((c) => c.key !== key && c.name === clean)) throw new DataError('Another column already uses this name.');
  return { operation: 'rename_column', params: { key, name: clean }, description: `Rename column to "${clean}"` };
}

export function opAddColumn(table, name) {
  const clean = name.trim();
  if (!clean) throw new DataError('Column name cannot be empty.');
  if (table.columns.some((c) => c.name === clean)) throw new DataError('A column with this name already exists.');
  return {
    operation: 'add_column',
    params: { key: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: clean, type: 'text' },
    description: `Add column "${clean}"`,
  };
}

export function inferTypeFor(table, key) {
  const i = colIndex(table, key);
  return i < 0 ? 'text' : inferColumnType(table.rows.map((r) => r[i]));
}

export { isMissing };
