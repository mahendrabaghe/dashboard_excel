import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Database, UploadCloud, Table2, LayoutPanelTop, Sparkles, Trash2, Pencil, Check, X } from 'lucide-react';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Button, Input, EmptyState, Spinner, ErrorBox, Badge, Modal } from '../components/ui/index.jsx';
import { formatNumber, formatBytes } from '@shared/dataUtils.js';

export default function DatasetsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError('');
    api.listDatasets(1, 100).then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const rename = async (id) => {
    try {
      const res = await api.renameDataset(id, name);
      setItems((list) => list.map((d) => (d.id === id ? { ...d, name: res.dataset.name } : d)));
      setEditing(null);
      toast.success('Dataset renamed.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    const d = confirm;
    setConfirm(null);
    try {
      await api.deleteDataset(d.id);
      setItems((list) => list.filter((x) => x.id !== d.id));
      toast.success(`Deleted "${d.name}".`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader
        title="My Datasets"
        description="All datasets you have imported. Only you can see these."
        actions={<Link to="/app/upload"><Button><UploadCloud className="h-4 w-4" /> Upload data</Button></Link>}
      />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!items && !error && <Spinner label="Loading datasets..." />}
      {items && items.length === 0 && (
        <EmptyState
          icon={Database}
          title="No datasets yet"
          description="Upload a CSV or Excel file to start exploring your data."
          action={<Link to="/app/upload"><Button>Upload your first file</Button></Link>}
        />
      )}
      {items && items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Source</th>
                  <th className="th text-right">Rows</th>
                  <th className="th text-right">Columns</th>
                  <th className="th">Status</th>
                  <th className="th">Updated</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td min-w-[220px]">
                      {editing === d.id ? (
                        <div className="flex items-center gap-2">
                          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-8" maxLength={120} onKeyDown={(e) => e.key === 'Enter' && rename(d.id)} />
                          <button onClick={() => rename(d.id)} className="rounded p-1 text-emerald-600 hover:bg-emerald-50" aria-label="Save name"><Check className="h-4 w-4" /></button>
                          <button onClick={() => setEditing(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cancel"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{d.name}</span>
                          <button onClick={() => { setEditing(d.id); setName(d.name); }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" aria-label="Rename dataset"><Pencil className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </td>
                    <td className="td text-slate-500">{d.source.originalName} · {formatBytes(d.source.sizeBytes)}</td>
                    <td className="td text-right tabular-nums">{formatNumber(d.rowCount, 0)}</td>
                    <td className="td text-right tabular-nums">{d.columnCount}</td>
                    <td className="td">
                      <Badge tone={d.status === 'ready' ? 'good' : d.status === 'failed' ? 'bad' : 'warn'}>{d.status}</Badge>
                    </td>
                    <td className="td text-slate-500">{new Date(d.updatedAt).toLocaleString()}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/app/explorer/${d.id}`)} title="Open in Data Explorer"><Table2 className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/app/charts/${d.id}`)} title="Charts"><Sparkles className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/app/dashboards?dataset=${d.id}`)} title="Dashboards"><LayoutPanelTop className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm(d)} title="Delete" className="text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="Delete dataset?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This permanently deletes <strong>{confirm?.name}</strong>, its cleaning history and all dashboards built on it. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
