import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutPanelTop, Plus, Copy, Trash2, Pencil, Check, X } from 'lucide-react';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Button, Input, EmptyState, Spinner, ErrorBox, Modal, Select, Field } from '../components/ui/index.jsx';
import { DatasetPicker } from '../components/DatasetPicker.jsx';

/** Lists the user's dashboards; creates new ones (auto-generated from a dataset). */
export default function DashboardsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [datasetId, setDatasetId] = useState(params.get('dataset') || '');
  const [mode, setMode] = useState('auto'); // auto | blank
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.listDashboards().then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { if (params.get('dataset')) setCreating(true); }, [params]);

  const create = async () => {
    if (!datasetId) return toast.error('Choose a dataset first.');
    if (!name.trim()) return toast.error('Name the dashboard.');
    setSaving(true);
    try {
      const res = await api.createDashboard({ datasetId, name: name.trim(), widgets: [] });
      toast.success('Dashboard created.');
      navigate(`/app/dashboards/${res.dashboard.id}?autogen=${mode === 'auto' ? 1 : 0}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const rename = async (id) => {
    if (!renameVal.trim()) return;
    try {
      const res = await api.updateDashboard(id, { name: renameVal.trim() });
      setItems((l) => l.map((d) => (d.id === id ? { ...d, name: res.dashboard.name } : d)));
      setRenaming(null);
      toast.success('Dashboard renamed.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const duplicate = async (d) => {
    try {
      const res = await api.duplicateDashboard(d.id);
      setItems((l) => [res.dashboard, ...l]);
      toast.success('Dashboard duplicated.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    const d = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.deleteDashboard(d.id);
      setItems((l) => l.filter((x) => x.id !== d.id));
      toast.success('Dashboard deleted.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Dashboard Builder"
        description="Create dashboards from your datasets. Each dashboard saves its layout, widgets and filters."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New dashboard</Button>}
      />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!items && !error && <Spinner label="Loading dashboards..." />}
      {items && items.length === 0 && (
        <EmptyState icon={LayoutPanelTop} title="No dashboards yet" description="Create a dashboard from one of your datasets. Charts and KPIs are generated automatically, and you can rearrange them." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create dashboard</Button>} />
      )}
      {items && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((d) => (
            <Card key={d.id} className="group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"><LayoutPanelTop className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  {renaming === d.id ? (
                    <div className="flex items-center gap-1">
                      <Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} className="h-8" autoFocus maxLength={120} onKeyDown={(e) => e.key === 'Enter' && rename(d.id)} />
                      <button onClick={() => rename(d.id)} className="p-1 text-emerald-600" aria-label="Save"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setRenaming(null)} className="p-1 text-slate-500" aria-label="Cancel"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <h3 className="truncate font-semibold">{d.name}</h3>
                  )}
                  <p className="text-xs text-slate-500">{d.widgets?.length ?? 0} widgets · updated {new Date(d.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate(`/app/dashboards/${d.id}`)}>Open</Button>
                <Button size="sm" variant="secondary" onClick={() => { setRenaming(d.id); setRenameVal(d.name); }}><Pencil className="h-3.5 w-3.5" /> Rename</Button>
                <Button size="sm" variant="secondary" onClick={() => duplicate(d)}><Copy className="h-3.5 w-3.5" /> Duplicate</Button>
                <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeleteTarget(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New dashboard"
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button loading={saving} onClick={create}>Create</Button></>}
      >
        <div className="space-y-4">
          <Field label="Dataset"><DatasetPicker value={datasetId} onChange={setDatasetId} className="w-full" /></Field>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales overview" maxLength={120} /></Field>
          <Field label="Starting layout">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="auto">Auto-generate KPIs and charts from column types</option>
              <option value="blank">Blank canvas</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete dashboard?"
        footer={<><Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">Delete <strong>{deleteTarget?.name}</strong>? The dataset itself is not affected.</p>
      </Modal>
    </>
  );
}
