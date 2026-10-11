import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import {
  Plus, Save, Eye, Pencil, Copy as CopyIcon, Trash2, Printer, FileText, Filter, LayoutPanelTop,
  Type, BarChart3, Table2, Gauge, Check, ArrowLeft, Settings2,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useWorkingDataset } from '../hooks/useWorkingDataset.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHeader, Card, Button, Input, Field, Select, Modal, Spinner, ErrorBox, EmptyState,
} from '../components/ui/index.jsx';
import { ChartRenderer } from '../components/charts/ChartRenderer.jsx';
import { ChartCard } from '../components/charts/ChartCard.jsx';
import { ChartConfigEditor } from '../components/charts/ChartConfigEditor.jsx';
import { KpiCard } from '../components/dashboard/KpiCard.jsx';
import { FilterBuilder, FilterChips } from '../components/filters/FilterBuilder.jsx';
import { EMPTY_FILTER, filterIndices, countActiveConditions } from '../utils/filters.js';
import { computeKpis, aggregateForChart } from '../utils/analytics.js';
import { recommendWidgets, makeWidget, defaultChartConfig } from '../utils/recommend.js';
import { uid } from '../lib/utils.js';
import { formatNumber } from '@shared/dataUtils.js';

const ResponsiveGrid = WidthProvider(Responsive);
const COLS = { lg: 12, md: 12, sm: 6, xs: 4 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 0 };

/**
 * Dashboard builder:
 *  - drag/resize widgets on a 12-column grid (react-grid-layout)
 *  - global filters applied to every widget, per-chart filters applied on top
 *  - add KPI / chart / table / text / filter widgets
 *  - save layout + widgets + filters to MongoDB; rename, duplicate, delete
 *  - preview mode (read-only) and print / save-as-PDF
 */
export default function DashboardBuilderPage() {
  const { dashboardId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [dash, setDash] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState('edit'); // edit | preview
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [widgets, setWidgets] = useState([]);
  const [globalFilter, setGlobalFilter] = useState(EMPTY_FILTER);
  const [showGlobal, setShowGlobal] = useState(false);
  const [editWidget, setEditWidget] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const [loading, setLoading] = useState(true);
  const autogenRef = useRef(false);
  const breakpoint = useRef('lg');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.getDashboard(dashboardId);
      setDash(res.dashboard);
      setWidgets(res.dashboard.widgets || []);
      setGlobalFilter(res.dashboard.globalFilters || EMPTY_FILTER);
      setDirty(false);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => { load(); }, [load]);

  const ds = useWorkingDataset(dash?.datasetId);
  const { table, profile, status } = ds;

  // Auto-generate starting widgets for a brand new dashboard
  useEffect(() => {
    if (!table || !dash || autogenRef.current) return;
    if (search.get('autogen') === '1' && (dash.widgets || []).length === 0) {
      autogenRef.current = true;
      setWidgets(recommendWidgets(table, table.rows, profile));
      setDirty(true);
    } else {
      autogenRef.current = true;
    }
  }, [table, dash, profile, search]);

  // Warn on navigation away with unsaved changes
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const rows = useMemo(() => {
    if (!table) return [];
    const idx = filterIndices(table, globalFilter);
    return idx.length === table.rows.length ? table.rows : idx.map((i) => table.rows[i]);
  }, [table, globalFilter]);

  const kpis = useMemo(() => (table ? computeKpis(table, rows, profile) : []), [table, rows, profile]);
  const kpiById = useMemo(() => new Map(kpis.map((k) => [k.id, k])), [kpis]);

  const layout = useMemo(
    () => widgets.map((w) => ({ i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, minW: 2, minH: 2 })),
    [widgets]
  );

  // Only the 12-column breakpoints (lg/md) are persisted; sm/xs are derived for small screens.
  const onLayoutChange = (lay) => {
    if (mode !== 'edit' || !['lg', 'md'].includes(breakpoint.current)) return;
    const changedIds = widgets.filter((w) => {
      const l = lay.find((x) => x.i === w.id);
      return l && (l.x !== w.layout.x || l.y !== w.layout.y || l.w !== w.layout.w || l.h !== w.layout.h);
    });
    if (!changedIds.length) return;
    setWidgets((ws) =>
      ws.map((w) => {
        const l = lay.find((x) => x.i === w.id);
        return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
      })
    );
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { widgets, globalFilters: globalFilter };
      const res = await api.updateDashboard(dash.id, payload);
      setDash(res.dashboard);
      setDirty(false);
      toast.success('Dashboard saved.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addWidget = (type) => {
    const w = makeWidget(type, {});
    if (type === 'chart' && table) {
      const num = profile.find((c) => c.type === 'number');
      const cat = profile.find((c) => c.type === 'text' && c.unique >= 2 && c.unique <= 60) || profile[0];
      w.config = defaultChartConfig({ x: cat?.key || null, ys: num ? [num.key] : [], agg: 'sum', chartType: 'bar' });
      w.title = cat && num ? `${num.name} by ${cat.name}` : 'New chart';
    }
    if (type === 'kpi' && kpis.length) {
      const k = kpis.find((x) => x.id !== 'records') || kpis[0];
      w.config = { kpiId: k.id, label: k.label, format: k.format };
      w.title = k.label;
    }
    if (type === 'table' && table) {
      w.config = { ys: table.columns.slice(0, 8).map((c) => c.key), limit: 50 };
    }
    // Append below the lowest widget without moving existing widgets (preserves the user's layout)
    setWidgets((ws) => {
      const bottom = ws.reduce((m, x) => Math.max(m, x.layout.y + x.layout.h), 0);
      return [...ws, { ...w, layout: { ...w.layout, x: 0, y: bottom } }];
    });
    setDirty(true);
    setAddOpen(false);
    toast.info(`${type.toUpperCase()} widget added. Drag it into place.`);
  };

  const removeWidget = (id) => {
    setWidgets((ws) => ws.filter((w) => w.id !== id));
    setDirty(true);
  };

  const duplicateWidget = (w) => {
    const copy = { ...structuredClone(w), id: uid(w.type), title: `${w.title} (copy)`, layout: { ...w.layout, y: w.layout.y + w.layout.h, x: w.layout.x } };
    setWidgets((ws) => [...ws, copy]);
    setDirty(true);
  };

  const saveEdit = () => {
    if (!editWidget) return;
    setWidgets((ws) => ws.map((w) => (w.id === editWidget.id ? editWidget : w)));
    setEditWidget(null);
    setDirty(true);
  };

  const doRename = async () => {
    try {
      const res = await api.updateDashboard(dash.id, { name: renameVal.trim() });
      setDash(res.dashboard);
      setRenameOpen(false);
      toast.success('Dashboard renamed.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const doDuplicate = async () => {
    try {
      if (dirty) await api.updateDashboard(dash.id, { widgets, globalFilters: globalFilter });
      const res = await api.duplicateDashboard(dash.id);
      toast.success('Duplicated. Opening the copy.');
      navigate(`/app/dashboards/${res.dashboard.id}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const doDelete = async () => {
    if (!window.confirm(`Delete "${dash.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteDashboard(dash.id);
      toast.success('Dashboard deleted.');
      navigate('/app/dashboards');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const exportPdf = () => {
    // Print-friendly layout: the browser's "Save as PDF" destination produces the PDF.
    setMode('preview');
    setTimeout(() => window.print(), 300);
  };

  const saveReport = async () => {
    try {
      const snapshot = {
        generatedAt: new Date().toISOString(),
        filters: globalFilter,
        rowCount: rows.length,
        kpis: kpis.map((k) => ({ label: k.label, value: k.value, format: k.format })),
        charts: widgets.filter((w) => w.type === 'chart').map((w) => ({ title: w.title, config: w.config, data: chartSnapshot(table, rows, w) })),
      };
      const summary = `${rows.length.toLocaleString()} rows analysed with ${kpis.length} KPIs and ${snapshot.charts.length} charts.`.slice(0, 4000);
      await api.createReport({ datasetId: dash.datasetId, dashboardId: dash.id, title: `${dash.name} report`, summary, snapshot });
      toast.success('Report saved. Find it under Saved Reports.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <Spinner label="Loading dashboard..." />;
  if (loadError) return <ErrorBox message={loadError} onRetry={load} />;
  if (!dash) return null;
  if (status === 'loading' || status === 'idle') return <Spinner label="Loading dataset..." />;
  if (ds.status === 'error') return <ErrorBox message={ds.error} onRetry={ds.reload} />;
  if (!table) return null;

  const isPreview = mode === 'preview';
  const activeGlobal = countActiveConditions(globalFilter);

  return (
    <>
      <div className="no-print mb-4 flex items-center gap-2">
        <button onClick={() => navigate('/app/dashboards')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> All dashboards</button>
      </div>
      <PageHeader
        title={dash.name}
        description={`${formatNumber(rows.length, 0)} of ${formatNumber(table.rows.length, 0)} rows · ${widgets.length} widgets · ${dirty ? 'Unsaved changes' : 'All changes saved'}`}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setMode(isPreview ? 'edit' : 'preview')}>
              {isPreview ? <><Pencil className="h-4 w-4" /> Edit</> : <><Eye className="h-4 w-4" /> Preview</>}
            </Button>
            {!isPreview && <Button variant="secondary" onClick={() => setShowGlobal((s) => !s)}><Filter className="h-4 w-4" /> Filters{activeGlobal ? ` (${activeGlobal})` : ''}</Button>}
            {!isPreview && <Button variant="secondary" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add widget</Button>}
            <Button variant="secondary" onClick={() => { setRenameVal(dash.name); setRenameOpen(true); }}><Pencil className="h-4 w-4" /> Rename</Button>
            <Button variant="secondary" onClick={doDuplicate}><CopyIcon className="h-4 w-4" /> Duplicate</Button>
            <Button variant="secondary" onClick={saveReport}><FileText className="h-4 w-4" /> Save report</Button>
            <Button variant="secondary" onClick={exportPdf}><Printer className="h-4 w-4" /> PDF / Print</Button>
            <Button variant="danger" size="md" onClick={doDelete}><Trash2 className="h-4 w-4" /></Button>
            <Button onClick={save} loading={saving} disabled={!dirty}><Save className="h-4 w-4" /> Save</Button>
          </div>
        }
      />

      {!isPreview && showGlobal && (
        <Card className="no-print mb-4 p-4">
          <FilterBuilder value={globalFilter} onChange={(f) => { setGlobalFilter(f); setDirty(true); }} columns={table.columns} title="Global filters (apply to every widget)" />
        </Card>
      )}
      {activeGlobal > 0 && <div className="no-print mb-4"><FilterChips filter={globalFilter} columns={table.columns} onClear={() => { setGlobalFilter(EMPTY_FILTER); setDirty(true); }} /></div>}

      {rows.length === 0 && <Card className="mb-4 border-amber-300 p-4 text-sm text-amber-800 dark:text-amber-300">No rows match the global filters. Adjust or clear them.</Card>}

      <div className="dashboard-print-root">
        <div className="mb-3 hidden print:block">
          <h1 className="text-xl font-semibold">{dash.name}</h1>
          <p className="text-xs text-slate-500">Generated {new Date().toLocaleString()} · {rows.length} rows · filters: {activeGlobal ? 'applied' : 'none'}</p>
        </div>

        {widgets.length === 0 ? (
          <EmptyState icon={LayoutPanelTop} title="This dashboard is empty" description="Add KPIs, charts, tables or notes to build your view." action={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add widget</Button>} />
        ) : (
          <ResponsiveGrid
            className="layout"
            layouts={{ lg: layout, md: layout, sm: layout.map((l) => ({ ...l, w: Math.min(l.w, 6), x: l.x >= 6 ? 0 : l.x })), xs: layout.map((l) => ({ ...l, w: 4, x: 0 })) }}
            breakpoints={BREAKPOINTS}
            cols={COLS}
            rowHeight={70}
            margin={[14, 14]}
            isDraggable={!isPreview}
            isResizable={!isPreview}
            draggableHandle=".drag-handle"
            onBreakpointChange={(bp) => { breakpoint.current = bp; }}
            onLayoutChange={(l) => onLayoutChange(l)}
            compactType="vertical"
          >
            {widgets.map((w) => (
              <div key={w.id} className="min-w-0">
                <WidgetView
                  widget={w}
                  table={table}
                  rows={rows}
                  profile={profile}
                  kpiById={kpiById}
                  kpis={kpis}
                  preview={isPreview}
                  onEdit={() => setEditWidget(structuredClone(w))}
                  onDuplicate={() => duplicateWidget(w)}
                  onDelete={() => removeWidget(w.id)}
                />
              </div>
            ))}
          </ResponsiveGrid>
        )}
      </div>

      {/* Add widget */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add widget" width="max-w-xl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ['kpi', 'KPI card', Gauge, 'A single headline metric'],
            ['chart', 'Chart', BarChart3, 'Bar, line, pie, scatter and more'],
            ['table', 'Data table', Table2, 'Preview rows from the data'],
            ['text', 'Text block', Type, 'Notes or commentary'],
            ['filter', 'Filter', FilterIcon, 'Filter label and quick summary'],
          ].map(([t, label, Icon, desc]) => (
            <button key={t} onClick={() => addWidget(t)} className="group rounded-xl border border-slate-200 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:shadow dark:border-slate-700">
              <Icon className="mb-2 h-5 w-5 text-brand-600" />
              <p className="font-medium">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </button>
          ))}
        </div>
      </Modal>

      {/* Edit widget */}
      <Modal
        open={Boolean(editWidget)}
        onClose={() => setEditWidget(null)}
        title={`Edit ${editWidget?.type}`}
        width="max-w-2xl"
        footer={<><Button variant="secondary" onClick={() => setEditWidget(null)}>Cancel</Button><Button onClick={saveEdit}><Check className="h-4 w-4" /> Apply</Button></>}
      >
        {editWidget && (
          <WidgetEditor widget={editWidget} onChange={setEditWidget} table={table} profile={profile} kpis={kpis} />
        )}
      </Modal>

      {/* Rename */}
      <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename dashboard" footer={<><Button variant="secondary" onClick={() => setRenameOpen(false)}>Cancel</Button><Button onClick={doRename} disabled={!renameVal.trim()}>Save</Button></>}>
        <Field label="Name"><Input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} maxLength={120} /></Field>
      </Modal>
    </>
  );
}

/** Renders a single widget. Widgets read from the global-filtered rows. */
function WidgetView({ widget, table, rows, profile, kpis, kpiById, preview, onEdit, onDuplicate, onDelete }) {
  const dragHandle = !preview;
  const controls = {
    onEdit: preview ? undefined : onEdit,
    onDuplicate: preview ? undefined : onDuplicate,
    onDelete: preview ? undefined : onDelete,
  };
  // Hooks must run unconditionally: compute the per-chart filtered rows up front
  const chartFilter = widget.config?.filter;
  const chartRows = useMemo(() => {
    if (!chartFilter || !chartFilter.groups?.length) return rows;
    const idx = filterIndices({ columns: table.columns, rows }, chartFilter);
    return idx.map((i) => rows[i]);
  }, [table, rows, chartFilter]);

  if (widget.type === 'kpi') {
    const k = kpiById.get(widget.config.kpiId) || { label: widget.title, value: null, format: 'num' };
    return (
      <div className="group relative h-full">
        <KpiCard kpi={{ ...k, label: widget.config.label || k.label }} />
        {!preview && (
          <div className="no-print absolute right-2 top-2 flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
            <button onClick={onEdit} className="rounded bg-white/90 p-1 text-slate-500 shadow dark:bg-slate-800" aria-label="Edit KPI"><Settings2 className="h-3.5 w-3.5" /></button>
            <button onClick={onDelete} className="rounded bg-white/90 p-1 text-rose-500 shadow dark:bg-slate-800" aria-label="Remove KPI"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {dragHandle && <div className="drag-handle absolute inset-x-0 top-0 h-3 cursor-move" />}
      </div>
    );
  }

  if (widget.type === 'text') {
    return (
      <Card className="relative h-full overflow-auto p-4">
        {dragHandle && <div className="drag-handle absolute inset-x-0 top-0 h-4 cursor-move" />}
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{widget.config.text}</p>
        {!preview && <WidgetActions {...controls} />}
      </Card>
    );
  }

  if (widget.type === 'filter') {
    return (
      <Card className="relative h-full p-4">
        {dragHandle && <div className="drag-handle absolute inset-x-0 top-0 h-4 cursor-move" />}
        <p className="text-xs uppercase tracking-wide text-slate-500">Filter</p>
        <p className="mt-1 text-sm">Use the Filters button above to change which rows every widget shows.</p>
        {!preview && <WidgetActions {...controls} />}
      </Card>
    );
  }

  if (widget.type === 'table') {
    const keys = widget.config.ys?.length ? widget.config.ys : table.columns.map((c) => c.key);
    const cols = table.columns.map((c, i) => ({ ...c, i })).filter((c) => keys.includes(c.key));
    return (
      <ChartCard title={widget.title} description={widget.description} dragHandle={dragHandle} {...(preview ? {} : controls)} fullHeight>
        <div className="max-h-[360px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse">
            <thead><tr>{cols.map((c) => <th key={c.key} className="th">{c.name}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, widget.config.limit || 50).map((r, ri) => (
                <tr key={ri}>{cols.map((c) => <td key={c.key} className="td">{r[c.i] === null ? '—' : typeof r[c.i] === 'number' ? r[c.i].toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(r[c.i])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-slate-400">Showing {Math.min(rows.length, widget.config.limit || 50)} of {rows.length.toLocaleString()} rows</p>
      </ChartCard>
    );
  }

  // chart
  const cfg = { ...defaultChartConfig(), ...widget.config };
  return (
    <ChartCard title={widget.title} description={widget.description} dragHandle={dragHandle} {...(preview ? {} : controls)} exportName={widget.title} fullHeight>
      <ChartRenderer table={table} rows={chartRows} profile={profile} config={cfg} height={Math.max(160, widget.layout.h * 70 - 120)} />
    </ChartCard>
  );
}

function WidgetActions({ onEdit, onDuplicate, onDelete }) {
  if (!onEdit) return null;
  return (
    <div className="no-print absolute right-2 top-2 flex gap-0.5">
      <button onClick={onEdit} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Edit widget"><Settings2 className="h-4 w-4" /></button>
      {onDuplicate && <button onClick={onDuplicate} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Duplicate widget"><CopyIcon className="h-4 w-4" /></button>}
      <button onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete widget"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

/** Widget settings editor for each widget type. */
function WidgetEditor({ widget, onChange, table, profile, kpis }) {
  const set = (patch) => onChange({ ...widget, ...patch });
  const setCfg = (patch) => onChange({ ...widget, config: { ...widget.config, ...patch } });

  if (widget.type === 'chart') {
    return (
      <ChartConfigEditor
        value={{ ...defaultChartConfig(), ...widget.config }}
        onChange={(cfg) => setCfg(cfg)}
        table={table}
        profile={profile}
        title={widget.title}
        description={widget.description}
        onTitle={(t) => set({ title: t })}
        onDescription={(d) => set({ description: d })}
      />
    );
  }
  if (widget.type === 'kpi') {
    return (
      <div className="space-y-3">
        <Field label="Title"><Input value={widget.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Metric">
          <Select value={widget.config.kpiId} onChange={(e) => { const k = kpis.find((x) => x.id === e.target.value); setCfg({ kpiId: e.target.value, label: k?.label, format: k?.format }); set({ title: k?.label || widget.title }); }}>
            {kpis.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-slate-500">Metrics are computed from the global-filtered data.</p>
      </div>
    );
  }
  if (widget.type === 'text') {
    return (
      <div className="space-y-3">
        <Field label="Title"><Input value={widget.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Text"><textarea rows={6} value={widget.config.text || ''} onChange={(e) => setCfg({ text: e.target.value })} className="input h-auto py-2" maxLength={2000} /></Field>
      </div>
    );
  }
  if (widget.type === 'table') {
    return (
      <div className="space-y-3">
        <Field label="Title"><Input value={widget.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Columns">
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2 dark:border-slate-700">
            {table.columns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!widget.config.ys?.length || widget.config.ys.includes(c.key)} onChange={() => {
                  const all = widget.config.ys?.length ? widget.config.ys : table.columns.map((x) => x.key);
                  setCfg({ ys: all.includes(c.key) ? all.filter((k) => k !== c.key) : [...all, c.key] });
                }} /> {c.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Rows to show"><Input type="number" min={5} max={200} value={widget.config.limit || 50} onChange={(e) => setCfg({ limit: Math.max(5, Math.min(200, Number(e.target.value) || 50)) })} /></Field>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Field label="Title"><Input value={widget.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <p className="text-sm text-slate-500">Filter widgets are informational. Use the global Filters panel to filter the dashboard.</p>
    </div>
  );
}

function chartSnapshot(table, rows, w) {
  const cfg = { ...defaultChartConfig(), ...w.config };
  if (!cfg.x) return [];
  const agg = aggregateForChart(table, rows, { x: cfg.x, ys: cfg.ys.length ? cfg.ys : [cfg.x], agg: cfg.ys.length ? cfg.agg : 'count', groupBy: cfg.groupBy, limit: cfg.limit });
  return agg.data.slice(0, 100);
}
