import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Trash2, Eye } from 'lucide-react';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Button, EmptyState, Spinner, ErrorBox, Modal } from '../components/ui/index.jsx';

export default function ReportsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError('');
    api.listReports().then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const remove = async () => {
    const r = target;
    setTarget(null);
    try {
      await api.deleteReport(r.id);
      setItems((l) => l.filter((x) => x.id !== r.id));
      toast.success('Report deleted.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader title="Saved Reports" description="Snapshots of KPIs, charts and findings. Reopen them at any time; they do not change when data is edited." />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!items && !error && <Spinner label="Loading reports..." />}
      {items && items.length === 0 && (
        <EmptyState icon={FileText} title="No reports saved" description="Open a dashboard or the AI Insights page and choose Save report to create one." action={<Button variant="secondary" onClick={() => navigate('/app/dashboards')}>Go to dashboards</Button>} />
      )}
      {items && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((r) => (
            <Card key={r.id} className="flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold" title={r.title}>{r.title}</h3>
                  <p className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
              </div>
              {r.summary && <p className="mt-3 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">{r.summary}</p>}
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => navigate(`/app/reports/${r.id}`)}><Eye className="h-3.5 w-3.5" /> Open</Button>
                <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setTarget(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={Boolean(target)} onClose={() => setTarget(null)} title="Delete report?" footer={<><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}>
        <p className="text-sm text-slate-600 dark:text-slate-300">Delete <strong>{target?.title}</strong>?</p>
      </Modal>
    </>
  );
}
