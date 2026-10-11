import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Undo2, Redo2, RotateCcw, Download, Plus, Search, Trash2, Columns3, Wand2, Calculator, Replace,
  Eraser, SortAsc, SortDesc, Filter, Copy, Type, Save, Loader2, FileSpreadsheet, FileText,
} from 'lucide-react';
import { DatasetPicker } from '../components/DatasetPicker.jsx';
import { useWorkingDataset } from '../hooks/useWorkingDataset.js';
import {
  PageHeader, Card, CardHeader, Button, Input, Select, Field, Modal, EmptyState, Spinner, ErrorBox, Badge,
} from '../components/ui/index.jsx';
import { FilterBuilder, FilterChips } from '../components/filters/FilterBuilder.jsx';
import { filterIndices, EMPTY_FILTER, countActiveConditions, describeFilter } from '../utils/filters.js';
import {
  opSetCell, opCalcColumn, opRenameColumn, opAddColumn, OPERATION_LABELS, isMissing,
} from '../utils/transforms.js';
import { exportCsv, exportXlsx, exportSummary } from '../services/exporters.js';
import { summaryStats } from '../utils/analytics.js';
import { useToast } from '../context/ToastContext.jsx';
import { EXPRESSION_FUNCTIONS } from '@shared/expressions.js';
import { convertValue } from '@shared/parseTable.js';
import { formatNumber } from '@shared/dataUtils.js';
import { cn } from '../lib/utils.js';

const PAGE_SIZE = 50;

export default function ExplorerPage() {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const ds = useWorkingDataset(datasetId);
  const { table, profile, status, error } = ds;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null); // { row, key, value }
  const [modal, setModal] = useState(null); // 'column' | 'calc' | 'rename' | 'replace' | 'missing' | 'type' | 'duplicates' | 'export' | 'addRow'
  const [modalData, setModalData] = useState({});
  const [busy, setBusy] = useState(false);

  // Reset view state when the dataset changes
  useEffect(() => {
    setFilter(EMPTY_FILTER);
    setSearch('');
    setSort({ key: null, dir: 'asc' });
    setPage(0);
  }, [datasetId]);

  // Filter indices into working table rows (kept so edits map to real rows)
  const visibleIdx = useMemo(() => {
    if (!table) return [];
    let idx = filterIndices(table, filter);
    const q = search.trim().toLowerCase();
    if (q) {
      idx = idx.filter((i) => table.rows[i].some((v) => v !== null && String(v).toLowerCase().includes(q)));
    }
    if (sort.key) {
      const ci = table.columns.findIndex((c) => c.key === sort.key);
      const type = table.columns[ci]?.type;
      const dir = sort.dir === 'asc' ? 1 : -1;
      idx = [...idx].sort((a, b) => {
        const va = table.rows[a][ci];
        const vb = table.rows[b][ci];
        if (va === null && vb === null) return 0;
        if (va === null) return 1; // blanks last
        if (vb === null) return -1;
        if (type === 'number' || type === 'boolean') return (Number(va) - Number(vb)) * dir;
        if (type === 'date') return (new Date(va) - new Date(vb)) * dir;
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
      });
    }
    return idx;
  }, [table, filter, search, sort]);

  useEffect(() => setPage(0), [visibleIdx.length]);
  const pageCount = Math.max(1, Math.ceil(visibleIdx.length / PAGE_SIZE));
  const pageIdx = visibleIdx.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl+Y / Ctrl+Shift+Z redo
  useEffect(() => {
    const onKey = (e) => {
      if (editing || modal) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); ds.undo(); }
      if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); ds.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, modal, ds]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      fn();
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Guard: Enter commits and unmounts the input, which can also fire blur. Commit once.
  const committingRef = useRef(false);
  const saveCell = () => {
    if (!editing || committingRef.current) return;
    committingRef.current = true;
    try {
      ds.dispatch(opSetCell(table, editing.row, editing.key, editing.value));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setEditing(null);
      setTimeout(() => { committingRef.current = false; }, 0);
    }
  };

  const distinctValues = useMemo(() => {
    if (!table) return {};
    const out = {};
    table.columns.forEach((c, i) => {
      if (c.type !== 'text') return;
      const set = new Set();
      for (const r of table.rows) {
        if (!isMissing(r[i])) {
          set.add(String(r[i]));
          if (set.size > 60) break;
        }
      }
      if (set.size <= 60) out[c.key] = [...set].sort();
    });
    return out;
  }, [table]);

  if (!datasetId) {
    return (
      <>
        <PageHeader title="Data Explorer" description="Clean and transform a dataset without writing code." />
        <Card className="p-5">
          <label className="label">Choose a dataset</label>
          <DatasetPicker value="" onChange={(id) => id && navigate(`/app/explorer/${id}`)} className="max-w-md" />
        </Card>
        {!ds.dataset && <div className="mt-6"><EmptyState title="Pick a dataset to start" description="Or upload a new file from the Upload Data page." action={<Button variant="secondary" onClick={() => navigate('/app/upload')}>Upload data</Button>} /></div>}
      </>
    );
  }

  if (status === 'loading' || status === 'idle') return <Spinner label="Loading dataset rows..." />;
  if (status === 'error') return <ErrorBox message={error} onRetry={ds.reload} />;
  if (!table) return null;

  const activeCount = countActiveConditions(filter);
  const sel = (fn) => () => fn();
  const openModal = (name, data = {}) => { setModalData(data); setModal(name); };

  const isModifiedVsRaw = ds.ops.length > 0;

  return (
    <>
      <PageHeader
        title={ds.dataset.name}
        description={`${formatNumber(table.rows.length, 0)} rows · ${table.columns.length} columns · ${ds.ops.length} cleaning step(s) · ${ds.dataset.source.originalName}`}
        actions={
          <>
            <DatasetPicker value={datasetId} onChange={(id) => id && navigate(`/app/explorer/${id}`)} className="w-56" />
            <SaveIndicator state={ds.saveState} />
          </>
        }
      />

      {/* Toolbar */}
      <Card className="no-print mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border-r border-slate-200 pr-2 dark:border-slate-700">
            <Button size="sm" variant="ghost" onClick={ds.undo} disabled={!ds.canUndo} title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /> Undo</Button>
            <Button size="sm" variant="ghost" onClick={ds.redo} disabled={!ds.canRedo} title="Redo (Ctrl+Y)"><Redo2 className="h-4 w-4" /> Redo</Button>
            <Button size="sm" variant="ghost" onClick={() => openModal('reset')} disabled={!isModifiedVsRaw} title="Discard all cleaning steps and show raw import"><RotateCcw className="h-4 w-4" /> Reset</Button>
          </div>
          <div className="flex items-center gap-1 border-r border-slate-200 pr-2 dark:border-slate-700">
            <Button size="sm" variant="secondary" onClick={() => openModal('addRow')}><Plus className="h-4 w-4" /> Row</Button>
            <Button size="sm" variant="secondary" onClick={() => openModal('column')}><Columns3 className="h-4 w-4" /> Column</Button>
            <Button size="sm" variant="secondary" onClick={() => openModal('calc')}><Calculator className="h-4 w-4" /> Calculated</Button>
          </div>
          <div className="flex items-center gap-1 border-r border-slate-200 pr-2 dark:border-slate-700">
            <Button size="sm" variant="secondary" onClick={() => openModal('replace')}><Replace className="h-4 w-4" /> Find & replace</Button>
            <Button size="sm" variant="secondary" onClick={() => openModal('missing')}><Wand2 className="h-4 w-4" /> Missing values</Button>
            <Button size="sm" variant="secondary" onClick={() => openModal('type')}><Type className="h-4 w-4" /> Convert type</Button>
            <Button size="sm" variant="secondary" onClick={() => openModal('duplicates')}><Copy className="h-4 w-4" /> Duplicates</Button>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={showFilters || activeCount ? 'outline' : 'secondary'} onClick={() => setShowFilters((s) => !s)}>
              <Filter className="h-4 w-4" /> Filters{activeCount ? ` (${activeCount})` : ''}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openModal('export')}><Download className="h-4 w-4" /> Export</Button>
          </div>
          <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search all cells..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search dataset" />
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <FilterBuilder value={filter} onChange={setFilter} columns={table.columns} distinctValues={distinctValues} />
          </div>
        )}
        {activeCount > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <FilterChips filter={filter} columns={table.columns} onClear={() => setFilter(EMPTY_FILTER)} />
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-sm dark:border-slate-800">
          <span className="text-slate-500">
            Showing <strong className="text-slate-800 dark:text-slate-200">{formatNumber(visibleIdx.length, 0)}</strong> of {formatNumber(table.rows.length, 0)} rows
            {activeCount > 0 && <> · filtered</>}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span className="tabular-nums text-slate-500">Page {page + 1} / {pageCount}</span>
            <Button size="sm" variant="ghost" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
        <div className="max-h-[calc(100vh-380px)] min-h-[300px] overflow-auto">
          {table.columns.length === 0 ? (
            <EmptyState title="No columns" description="Add a column to start." />
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="th w-14 text-right">#</th>
                  {table.columns.map((c) => (
                    <th key={c.key} className="th group">
                      <div className="flex items-center gap-1">
                        <button
                          className="flex min-w-0 items-center gap-1 hover:text-brand-600"
                          onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}
                          title="Sort"
                        >
                          <span className="max-w-[160px] truncate">{c.name}</span>
                          {sort.key === c.key && (sort.dir === 'asc' ? <SortAsc className="h-3.5 w-3.5" /> : <SortDesc className="h-3.5 w-3.5" />)}
                        </button>
                        <Badge tone={c.type === 'number' ? 'brand' : c.type === 'date' ? 'warn' : c.type === 'boolean' ? 'good' : 'default'} className="px-1.5 py-0 text-[10px]">{c.type}</Badge>
                        <button onClick={() => openModal('renameCol', { key: c.key, name: c.name })} className="ml-auto rounded p-0.5 opacity-0 hover:bg-slate-200 group-hover:opacity-100 dark:hover:bg-slate-700" aria-label={`Rename ${c.name}`} title="Rename column">
                          <Type className="h-3 w-3" />
                        </button>
                        <button onClick={() => { if (confirmDelete(c.name)) run(() => ds.dispatch({ operation: 'delete_column', params: { key: c.key }, description: `Delete column "${c.name}"` }), `Deleted column "${c.name}".`); }} className="rounded p-0.5 opacity-0 hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100" aria-label={`Delete ${c.name}`} title="Delete column">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageIdx.length === 0 && (
                  <tr><td colSpan={table.columns.length + 1} className="p-8 text-center text-sm text-slate-500">No rows match the current search and filters.</td></tr>
                )}
                {pageIdx.map((ri, k) => (
                  <tr key={ri} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="td w-14 text-right text-xs text-slate-400">
                      <div className="flex items-center justify-end gap-1">
                        <span>{ri + 1}</span>
                        <button onClick={() => run(() => ds.dispatch({ operation: 'delete_row', params: { index: ri }, description: `Delete row ${ri + 1}` }), 'Row deleted.')} className="rounded p-0.5 text-slate-300 opacity-0 hover:text-rose-600 group-hover:opacity-100" aria-label={`Delete row ${ri + 1}`}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    {table.columns.map((c, ci) => {
                      const v = table.rows[ri][ci];
                      const isEditing = editing && editing.row === ri && editing.key === c.key;
                      return (
                        <td
                          key={c.key}
                          className={cn('td max-w-[280px] cursor-text', isMissing(v) && 'bg-amber-50/60 dark:bg-amber-900/10')}
                          onDoubleClick={() => setEditing({ row: ri, key: c.key, value: v === null ? '' : c.type === 'date' ? String(v).slice(0, 10) : String(v) })}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              className="w-full min-w-[120px] rounded border border-brand-500 bg-white px-1.5 py-0.5 text-sm outline-none ring-2 ring-brand-500/30 dark:bg-slate-900"
                              type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                              value={editing.value}
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              onBlur={saveCell}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCell();
                                if (e.key === 'Escape') setEditing(null);
                              }}
                            />
                          ) : (
                            <CellValue value={v} type={c.type} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400 dark:border-slate-800">Double-click a cell to edit. Press Enter to save, Esc to cancel. Amber cells are missing values.</p>
      </Card>

      {/* Cleaning history */}
      {ds.ops.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Cleaning history</h3>
            <span className="text-xs text-slate-500">Raw import is always preserved. Undo removes steps from the end.</span>
          </div>
          <ol className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {ds.ops.map((o, i) => (
              <li key={i} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span className="w-6 text-right text-xs tabular-nums text-slate-400">{i + 1}.</span>
                <Badge>{OPERATION_LABELS[o.operation] || o.operation}</Badge>
                <span className="truncate">{o.description}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Modals
        modal={modal}
        setModal={setModal}
        modalData={modalData}
        table={table}
        ds={ds}
        filter={filter}
        visibleIdx={visibleIdx}
        profile={profile}
        toast={toast}
        busy={busy}
        setBusy={setBusy}
        datasetName={ds.dataset.name}
        search={search}
      />
    </>
  );
}

function confirmDelete(name) {
  return window.confirm(`Delete column "${name}"? You can undo this.`);
}

function CellValue({ value, type }) {
  if (value === null || value === undefined) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  if (type === 'boolean') return <span className={value ? 'text-emerald-600' : 'text-rose-600'}>{value ? 'TRUE' : 'FALSE'}</span>;
  if (type === 'number') return <span className="block text-right tabular-nums">{Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>;
  if (type === 'date') {
    const d = new Date(value);
    return <span className="tabular-nums">{Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()}</span>;
  }
  return <span className="block max-w-[260px] truncate" title={String(value)}>{String(value)}</span>;
}

function SaveIndicator({ state }) {
  const map = {
    saved: ['text-emerald-600', 'Saved'],
    dirty: ['text-slate-500', 'Unsaved'],
    saving: ['text-brand-600', 'Saving...'],
    error: ['text-rose-600', 'Save failed'],
  };
  const [cls, label] = map[state] || map.saved;
  return <span className={cn('flex items-center gap-1 text-xs', cls)}>{state === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}{label}</span>;
}

/* ---------------- Modals ---------------- */

function Modals({ modal, setModal, modalData, table, ds, filter, visibleIdx, profile, toast, busy, setBusy, datasetName, search }) {
  const close = () => setModal(null);
  const [form, setForm] = useState({});
  useEffect(() => { setForm({ ...modalData }); }, [modal]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (fn, okMsg) => {
    setBusy(true);
    try {
      fn();
      if (okMsg) toast.success(okMsg);
      close();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const numericCols = table.columns.filter((c) => c.type === 'number');
  const textCols = table.columns.filter((c) => c.type === 'text');

  return (
    <>
      <Modal open={modal === 'addRow'} onClose={close} title="Add row" footer={<Button onClick={() => apply(() => ds.dispatch({ operation: 'add_row', params: {}, description: 'Add empty row' }), 'Row added.')}>Add row</Button>}>
        <p className="text-sm text-slate-600 dark:text-slate-300">A new empty row is appended at the end of the dataset. Double-click its cells to fill them in.</p>
      </Modal>

      <Modal open={modal === 'column'} onClose={close} title="Add column" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => apply(() => ds.dispatch(opAddColumn(table, form.name || '')), 'Column added.')}>Add column</Button></>}>
        <Field label="Column name"><Input autoFocus value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      </Modal>

      <Modal open={modal === 'renameCol'} onClose={close} title="Rename column" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => apply(() => ds.dispatch(opRenameColumn(table, form.key, form.name || '')), 'Column renamed.')}>Save</Button></>}>
        <Field label="New name"><Input autoFocus value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={255} /></Field>
      </Modal>

      <Modal
        open={modal === 'calc'}
        onClose={close}
        title="Calculated column"
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={() => apply(() => ds.dispatch(opCalcColumn(table, form.name || '', form.expression || '')), 'Calculated column added.')}>Add column</Button></>}
      >
        <div className="space-y-3">
          <Field label="Column name"><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Profit" /></Field>
          <Field label="Expression" hint={`Use [Column Name] for names with spaces. Operators: + - * / % ^ and comparisons. Functions: ${EXPRESSION_FUNCTIONS.join(', ')}.`}>
            <Input value={form.expression || ''} onChange={(e) => setForm({ ...form, expression: e.target.value })} placeholder="[Revenue] - [Cost]" className="font-mono" />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {table.columns.filter((c) => c.type === 'number').slice(0, 10).map((c) => (
              <button key={c.key} onClick={() => setForm({ ...form, expression: `${form.expression || ''}[${c.name}]` })} className="rounded-full border px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">+ {c.name}</button>
            ))}
          </div>
          {!numericCols.length && <p className="text-xs text-amber-600">No numeric columns are available. Convert a column to number first.</p>}
        </div>
      </Modal>

      <Modal
        open={modal === 'replace'}
        onClose={close}
        title="Find & replace"
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => apply(() => ds.dispatch({ operation: 'find_replace', params: { key: form.key || null, find: form.find || '', replace: form.replace ?? '', matchCase: !!form.matchCase, wholeCell: !!form.wholeCell }, description: `Replace "${form.find}" with "${form.replace ?? ''}"${form.key ? ` in ${table.columns.find((c) => c.key === form.key)?.name}` : ' in all columns'}` }), 'Replacement applied.')} disabled={!form.find}>Apply</Button></>}
      >
        <div className="space-y-3">
          <Field label="Find"><Input autoFocus value={form.find || ''} onChange={(e) => setForm({ ...form, find: e.target.value })} /></Field>
          <Field label="Replace with"><Input value={form.replace ?? ''} onChange={(e) => setForm({ ...form, replace: e.target.value })} placeholder="(leave empty to delete the text)" /></Field>
          <Field label="Column"><Select value={form.key || ''} onChange={(e) => setForm({ ...form, key: e.target.value })}><option value="">All columns</option>{table.columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.matchCase} onChange={(e) => setForm({ ...form, matchCase: e.target.checked })} /> Match case</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.wholeCell} onChange={(e) => setForm({ ...form, wholeCell: e.target.checked })} /> Whole cell only</label>
          </div>
        </div>
      </Modal>

      <Modal
        open={modal === 'missing'}
        onClose={close}
        title="Handle missing values"
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => apply(() => {
          const f = form.action || 'remove';
          const col = table.columns.find((c) => c.key === form.key);
          if (!col) throw new Error('Choose a column.');
          if (f === 'remove') return ds.dispatch({ operation: 'delete_missing_rows', params: { key: col.key }, description: `Remove rows with missing "${col.name}"` });
          if (f === 'fill') {
            const mode = form.fillMode || (col.type === 'number' ? 'mean' : 'mode');
            return ds.dispatch({ operation: 'fill_missing', params: { key: col.key, mode, value: form.value }, description: `Fill missing "${col.name}" (${mode})` });
          }
          if (f === 'value') {
            if (form.value === undefined || form.value === '') throw new Error('Enter a custom value.');
            return ds.dispatch({ operation: 'fill_missing', params: { key: col.key, mode: 'value', value: form.value }, description: `Fill missing "${col.name}" with "${form.value}"` });
          }
        }, 'Missing values updated.')}>Apply</Button></>}
      >
        <div className="space-y-3">
          <Field label="Column"><Select value={form.key || ''} onChange={(e) => setForm({ ...form, key: e.target.value })}><option value="">Select column</option>{table.columns.map((c) => <option key={c.key} value={c.key}>{c.name} ({profile.find((p) => p.key === c.key)?.missing ?? 0} missing)</option>)}</Select></Field>
          <Field label="Action">
            <Select value={form.action || 'remove'} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              <option value="remove">Remove rows with missing values</option>
              <option value="fill">Fill with statistic (mean/median/mode)</option>
              <option value="value">Fill with custom value</option>
            </Select>
          </Field>
          {form.action === 'fill' && (
            <Field label="Statistic"><Select value={form.fillMode || ''} onChange={(e) => setForm({ ...form, fillMode: e.target.value })}>
              <option value="">Automatic (mean for numbers, most common for text)</option>
              <option value="mean">Mean (numbers only)</option>
              <option value="median">Median (numbers only)</option>
              <option value="mode">Most common value</option>
            </Select></Field>
          )}
          {form.action === 'value' && <Field label="Custom value"><Input value={form.value ?? ''} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>}
          {numericCols.length === 0 && textCols.length === 0 && <p className="text-xs text-slate-500">No columns to process.</p>}
        </div>
      </Modal>

      <Modal
        open={modal === 'type'}
        onClose={close}
        title="Convert column type"
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => apply(() => {
          const col = table.columns.find((c) => c.key === form.key);
          if (!col) throw new Error('Choose a column.');
          if (!form.type || form.type === col.type) throw new Error('Choose a different type.');
          // Pre-validate so the user learns how many values will be lost
          let lost = 0;
          table.rows.forEach((r) => { const v = r[table.columns.indexOf(col)]; if (!isMissing(v) && convertValue(v, form.type) === null) lost += 1; });
          if (lost && !window.confirm(`${lost} value(s) cannot be converted to ${form.type} and will become empty. Continue?`)) throw new Error('Conversion cancelled.');
          ds.dispatch({ operation: 'convert_type', params: { key: col.key, type: form.type }, description: `Convert "${col.name}" to ${form.type}` });
        }, 'Column type converted.')}>Convert</Button></>}
      >
        <div className="space-y-3">
          <Field label="Column"><Select value={form.key || ''} onChange={(e) => setForm({ ...form, key: e.target.value })}><option value="">Select column</option>{table.columns.map((c) => <option key={c.key} value={c.key}>{c.name} (currently {c.type})</option>)}</Select></Field>
          <Field label="New type"><Select value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="">Select type</option><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Boolean</option></Select></Field>
        </div>
      </Modal>

      <Modal
        open={modal === 'duplicates'}
        onClose={close}
        title="Remove duplicate rows"
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="danger" onClick={() => apply(() => ds.dispatch({ operation: 'dedupe', params: { keys: form.keys?.length ? form.keys : null }, description: form.keys?.length ? `Remove duplicates by ${form.keys.map((k) => table.columns.find((c) => c.key === k)?.name).join(', ')}` : 'Remove fully duplicated rows' }), 'Duplicates removed.')}>Remove duplicates</Button></>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">By default a row is a duplicate only if every value matches. Select key columns to compare only those.</p>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2 dark:border-slate-700">
            {table.columns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <input type="checkbox" checked={(form.keys || []).includes(c.key)} onChange={(e) => setForm({ ...form, keys: e.target.checked ? [...(form.keys || []), c.key] : (form.keys || []).filter((k) => k !== c.key) })} />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'reset'} onClose={close} title="Reset cleaning?" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="danger" onClick={() => apply(() => ds.reset(), 'Cleaning steps cleared. Raw import restored.')}>Reset</Button></>}>
        <p className="text-sm text-slate-600 dark:text-slate-300">This removes all {ds.ops.length} cleaning step(s). Your original imported data is unchanged.</p>
      </Modal>

      <Modal open={modal === 'export'} onClose={close} title="Export dataset" width="max-w-xl" footer={<Button variant="ghost" onClick={close}>Close</Button>}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Exports include all cleaning steps and the current filter ({describeFilter(filter, table.columns) || 'none'}) and search.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => { exportCsv(table, visibleRows(table, visibleIdx), datasetName); toast.success('CSV downloaded.'); }}><FileText className="h-4 w-4" /> Cleaned data (CSV)</Button>
            <Button variant="secondary" onClick={() => { exportXlsx(table, visibleRows(table, visibleIdx), datasetName); toast.success('Excel file downloaded.'); }}><FileSpreadsheet className="h-4 w-4" /> Cleaned data (Excel)</Button>
            <Button variant="secondary" onClick={() => { exportSummary(summaryStats(profile, visibleRows(table, visibleIdx)), datasetName, 'csv'); toast.success('Summary CSV downloaded.'); }}><Download className="h-4 w-4" /> Summary stats (CSV)</Button>
            <Button variant="secondary" onClick={() => { exportSummary(summaryStats(profile, visibleRows(table, visibleIdx)), datasetName, 'xlsx'); toast.success('Summary Excel downloaded.'); }}><Download className="h-4 w-4" /> Summary stats (Excel)</Button>
          </div>
          <p className="text-xs text-slate-500">Rows exported: {visibleIdx.length.toLocaleString()} {search ? '(search applied)' : ''}</p>
        </div>
      </Modal>
    </>
  );
}

function visibleRows(table, idx) {
  return idx.map((i) => table.rows[i]);
}
