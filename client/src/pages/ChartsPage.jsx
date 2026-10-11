import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Sparkles, Filter, Printer } from 'lucide-react';
import { DatasetPicker } from '../components/DatasetPicker.jsx';
import { useWorkingDataset } from '../hooks/useWorkingDataset.js';
import { PageHeader, Card, Button, Modal, Spinner, ErrorBox, EmptyState } from '../components/ui/index.jsx';
import { ChartRenderer } from '../components/charts/ChartRenderer.jsx';
import { ChartCard } from '../components/charts/ChartCard.jsx';
import { ChartConfigEditor } from '../components/charts/ChartConfigEditor.jsx';
import { KpiCard } from '../components/dashboard/KpiCard.jsx';
import { FilterBuilder, FilterChips } from '../components/filters/FilterBuilder.jsx';
import { EMPTY_FILTER, filterIndices, countActiveConditions } from '../utils/filters.js';
import { recommendWidgets, makeChartWidget, defaultChartConfig } from '../utils/recommend.js';
import { computeKpis } from '../utils/analytics.js';
import { useToast } from '../context/ToastContext.jsx';
import { uid } from '../lib/utils.js';
import { useMemoizedFilteredRows } from '../hooks/useFilteredRows.js';
import { api } from '../services/api.js';

/** Charts workspace: create, edit, duplicate and delete charts on the cleaned dataset. */
export default function ChartsPage() {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const ds = useWorkingDataset(datasetId);
  const { table, profile, status, error } = ds;

  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [charts, setCharts] = useState([]);
  const [editing, setEditing] = useState(null); // widget being edited (draft)
  const [showFilter, setShowFilter] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Global filter is applied to all charts. Per-chart filters are applied on top.
  const rows = useMemoizedFilteredRows(table, filter);
  const kpis = useMemo(() => (table ? computeKpis(table, rows, profile) : []), [table, rows, profile]);

  // Initialise recommended charts once per dataset (saved charts are kept in-memory until a dashboard is created)
  useEffect(() => {
    setLoaded(false);
    setFilter(EMPTY_FILTER);
    setCharts([]);
  }, [datasetId]);
  useEffect(() => {
    if (!table || loaded) return;
    setCharts(recommendWidgets(table, table.rows, profile).filter((w) => w.type === 'chart' || w.type === 'table').map((w) => ({ ...w, id: uid('c') })));
    setLoaded(true);
  }, [table, profile, loaded]);

  const saveAsDashboard = async () => {
    try {
      const widgets = charts.map((c, i) => ({ ...c, layout: { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 } }));
      const res = await api.createDashboard({ datasetId, name: `${ds.dataset.name} — charts`, widgets, globalFilters: filter });
      toast.success('Saved as a dashboard.');
      navigate(`/app/dashboards/${res.dashboard.id}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!datasetId) {
    return (
      <>
        <PageHeader title="Charts & Visualization" description="Build interactive charts from any dataset." />
        <Card className="p-5"><label className="label">Choose a dataset</label><DatasetPicker value="" onChange={(id) => id && navigate(`/app/charts/${id}`)} className="max-w-md" /></Card>
      </>
    );
  }
  if (status === 'loading' || status === 'idle') return <Spinner label="Loading dataset..." />;
  if (status === 'error') return <ErrorBox message={error} onRetry={ds.reload} />;
  if (!table) return null;

  const distinctValues = {};
  const activeCount = countActiveConditions(filter);

  const addChart = (type = 'bar') => {
    const numeric = profile.find((c) => c.type === 'number');
    const cat = profile.find((c) => c.type === 'text' && c.unique >= 2 && c.unique <= 60);
    const date = profile.find((c) => c.type === 'date');
    const x = type === 'scatter' || type === 'histogram' ? numeric?.key : cat?.key || date?.key || table.columns[0].key;
    const next = makeChartWidget(`New ${type} chart`, '', { chartType: type, x, ys: numeric && type !== 'histogram' ? [numeric.key] : x ? [] : [], agg: 'sum' });
    setCharts((cs) => [...cs, { ...next, id: uid('c') }]);
    setEditing({ ...next, id: null, isNew: true });
  };

  const save = (draft) => {
    if (!draft.config.x && draft.config.chartType !== 'heatmap') return toast.error('Choose an X column for the chart.');
    if (draft.config.chartType === 'scatter' && !draft.config.ys[0]) return toast.error('Choose a Y column for the scatter plot.');
    setCharts((cs) => {
      if (draft.isNew) return cs.map((c, i) => (i === cs.length - 1 ? { ...draft, isNew: undefined } : c));
      return cs.map((c) => (c.id === draft.id ? { ...draft } : c));
    });
    setEditing(null);
    toast.success('Chart updated.');
  };

  const duplicate = (c) => {
    setCharts((cs) => {
      const i = cs.findIndex((x) => x.id === c.id);
      const copy = { ...structuredClone(c), id: uid('c'), title: `${c.title} (copy)` };
      const out = cs.slice();
      out.splice(i + 1, 0, copy);
      return out;
    });
    toast.success('Chart duplicated.');
  };

  const remove = (id) => {
    setCharts((cs) => cs.filter((c) => c.id !== id));
    toast.success('Chart deleted.');
  };

  const changeType = (c, t) => setCharts((cs) => cs.map((x) => (x.id === c.id ? { ...x, config: { ...x.config, chartType: t } } : x)));

  return (
    <>
      <PageHeader
        title={ds.dataset.name}
        description={`Charts are computed from ${rows.length.toLocaleString()} of ${table.rows.length.toLocaleString()} cleaned rows.`}
        actions={
          <>
            <DatasetPicker value={datasetId} onChange={(id) => id && navigate(`/app/charts/${id}`)} className="w-56" />
            <Button variant="secondary" onClick={() => setShowFilter((s) => !s)}><Filter className="h-4 w-4" /> Filters{activeCount ? ` (${activeCount})` : ''}</Button>
            <Button variant="secondary" onClick={() => addChart('bar')}><Plus className="h-4 w-4" /> Add chart</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            <Button onClick={saveAsDashboard}><Sparkles className="h-4 w-4" /> Save as dashboard</Button>
          </>
        }
      />

      {showFilter && (
        <Card className="mb-4 p-4">
          <FilterBuilder value={filter} onChange={setFilter} columns={table.columns} distinctValues={distinctValues} title="Global filters (apply to all charts)" />
        </Card>
      )}
      {activeCount > 0 && <div className="mb-4"><FilterChips filter={filter} columns={table.columns} onClear={() => setFilter(EMPTY_FILTER)} /></div>}

      {kpis.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {kpis.slice(0, 4).map((k) => <KpiCard key={k.id} kpi={k} />)}
        </div>
      )}

      {rows.length === 0 && (
        <Card className="mb-4 border-amber-300 p-4 text-sm text-amber-800 dark:text-amber-300">No rows match the current filters. Clear them to see charts.</Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {charts.map((c) => (
          <ChartCard
            key={c.id}
            title={c.title}
            description={c.description}
            onEdit={() => setEditing({ ...structuredClone(c) })}
            onDuplicate={() => duplicate(c)}
            onDelete={() => remove(c.id)}
            exportName={c.title}
          >
            <div className="mb-2 flex flex-wrap gap-1">
              {['bar', 'line', 'area', 'pie', 'scatter'].map((t) => (
                <button key={t} onClick={() => changeType(c, t)} className={`rounded-md px-2 py-0.5 text-xs capitalize ${c.config.chartType === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>{t}</button>
              ))}
            </div>
            <ChartPanel table={table} rows={rows} profile={profile} config={c.config} />
          </ChartCard>
        ))}
      </div>

      {charts.length === 0 && <EmptyState icon={Sparkles} title="No charts yet" description="Add a chart to start visualising your data." action={<Button onClick={() => addChart('bar')}><Plus className="h-4 w-4" /> Add chart</Button>} />}

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          if (editing?.isNew) setCharts((cs) => cs.slice(0, -1));
          setEditing(null);
        }}
        title={editing?.isNew ? 'New chart' : 'Edit chart'}
        width="max-w-2xl"
        footer={<><Button variant="secondary" onClick={() => { if (editing?.isNew) setCharts((cs) => cs.slice(0, -1)); setEditing(null); }}>Cancel</Button><Button onClick={() => save(editing)}>Save chart</Button></>}
      >
        {editing && (
          <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
            <ChartConfigEditor
              value={editing.config}
              onChange={(cfg) => setEditing({ ...editing, config: cfg })}
              table={table}
              profile={profile}
              title={editing.title}
              description={editing.description}
              onTitle={(t) => setEditing({ ...editing, title: t })}
              onDescription={(d) => setEditing({ ...editing, description: d })}
            />
            <div>
              <p className="label">Preview</p>
              <ChartPanel table={table} rows={rows} profile={profile} config={editing.config} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Applies the chart's own filter on top of the global filtered rows. */
function ChartPanel({ table, rows, profile, config }) {
  const local = useMemo(() => {
    const f = config.filter;
    if (!f || !f.groups?.length) return rows;
    const idx = filterIndices({ columns: table.columns, rows }, f);
    return idx.map((i) => rows[i]);
  }, [table, rows, config.filter]);
  return <ChartRenderer table={table} rows={local} profile={profile} config={{ ...defaultChartConfig(), ...config }} height={260} />;
}
