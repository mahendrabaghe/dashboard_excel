import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { replay } from '../utils/transforms.js';
import { columnProfile } from '../utils/analytics.js';

export const MAX_OPERATIONS = 2000;

/** Module-level cache so switching pages does not re-download the same dataset. */
const rawCache = new Map();
const MAX_CACHE = 4;

async function loadRaw(datasetId) {
  if (rawCache.has(datasetId)) return rawCache.get(datasetId);
  const [meta, txs] = await Promise.all([api.getDataset(datasetId), api.getTransformations(datasetId)]);
  const dataset = meta.dataset;
  const count = dataset.chunkCount || 0;
  const chunks = new Array(count);
  const CONCURRENCY = 6;
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const i = next;
      next += 1;
      const res = await api.getChunk(datasetId, i);
      chunks[i] = res.rows;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count) }, worker));
  const rows = chunks.flat();
  const raw = { dataset, columns: dataset.columns.map((c) => ({ ...c })), rows };
  const ops = txs.items.map((t) => ({ operation: t.operation, params: t.params, description: t.description }));
  const entry = { raw, ops };
  if (rawCache.size >= MAX_CACHE) rawCache.delete(rawCache.keys().next().value);
  rawCache.set(datasetId, entry);
  return entry;
}

const EMPTY_HISTORY = { ops: [], redo: [] };

/**
 * Loads a dataset (raw chunks + saved transformation log) and exposes the working table.
 * Every edit is an operation appended to the log. Undo moves the last operation to the
 * redo stack, redo moves it back. The log is persisted to MongoDB (debounced).
 * All state transitions are pure (no side effects inside updaters) so StrictMode is safe.
 */
export function useWorkingDataset(datasetId) {
  const [state, setState] = useState({ status: 'idle', error: null, dataset: null, raw: null });
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving | error
  const loadedRef = useRef(false);
  const saveTimer = useRef(null);
  const savingSeq = useRef(0);

  const load = useCallback(async () => {
    if (!datasetId) return;
    // Clear the previous dataset so consumers never render stale data for the new id
    setState({ status: 'loading', error: null, dataset: null, raw: null });
    loadedRef.current = false;
    try {
      const { raw, ops: savedOps } = await loadRaw(datasetId);
      setState({ status: 'ready', error: null, dataset: raw.dataset, raw });
      setHistory({ ops: savedOps, redo: [] });
      setSaveState('saved');
      loadedRef.current = true;
    } catch (err) {
      setState({ status: 'error', error: err.message, dataset: null, raw: null });
    }
  }, [datasetId]);

  useEffect(() => {
    setHistory(EMPTY_HISTORY);
    load();
    return () => clearTimeout(saveTimer.current);
  }, [load]);

  // Persist the operation log (debounced) after the initial load
  useEffect(() => {
    if (!loadedRef.current || !datasetId) return undefined;
    setSaveState('dirty');
    clearTimeout(saveTimer.current);
    const ops = history.ops;
    const seq = ++savingSeq.current;
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.saveTransformations(datasetId, ops.map((o) => ({ operation: o.operation, params: o.params, description: o.description })));
        if (seq === savingSeq.current) setSaveState('saved');
        const entry = rawCache.get(datasetId);
        if (entry) entry.ops = ops;
      } catch {
        if (seq === savingSeq.current) setSaveState('error');
      }
    }, 600);
    return undefined;
  }, [history.ops, datasetId]);

  const ops = history.ops;
  const working = useMemo(() => (state.raw ? replay(state.raw, ops) : null), [state.raw, ops]);
  const profile = useMemo(() => (working ? columnProfile(working) : []), [working]);

  const dispatch = useCallback((op) => {
    setHistory((h) => {
      if (h.ops.length >= MAX_OPERATIONS) return h;
      return { ops: [...h.ops, op], redo: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.ops.length) return h;
      return { ops: h.ops.slice(0, -1), redo: [h.ops[h.ops.length - 1], ...h.redo] };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.redo.length) return h;
      const [next, ...rest] = h.redo;
      return { ops: [...h.ops, next], redo: rest };
    });
  }, []);

  const reset = useCallback(() => setHistory({ ops: [], redo: [] }), []);

  return {
    status: state.status,
    error: state.error,
    dataset: state.dataset,
    raw: state.raw,
    table: working,
    profile,
    ops,
    canUndo: ops.length > 0,
    canRedo: history.redo.length > 0,
    saveState,
    dispatch,
    undo,
    redo,
    reset,
    reload: load,
  };
}

export function invalidateDatasetCache(datasetId) {
  rawCache.delete(datasetId);
}
