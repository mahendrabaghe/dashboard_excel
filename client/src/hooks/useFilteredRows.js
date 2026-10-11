import { useMemo } from 'react';
import { filterIndices } from '../utils/filters.js';

/**
 * Returns the working-table rows that match a filter, memoised on (table, filter).
 * Keeps re-renders cheap: the filter only runs when either input changes.
 */
export function useMemoizedFilteredRows(table, filter) {
  return useMemo(() => {
    if (!table) return [];
    const idx = filterIndices(table, filter);
    if (idx.length === table.rows.length) return table.rows;
    return idx.map((i) => table.rows[i]);
  }, [table, filter]);
}
