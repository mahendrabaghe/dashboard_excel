import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../services/api.js';
import { PageHeader, Card, Button, Spinner, ErrorBox } from '../components/ui/index.jsx';
import { KpiCard } from '../components/dashboard/KpiCard.jsx';


/** Reopens a saved report snapshot. Chart data is frozen in the snapshot at save time. */
export default function ReportViewPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.getReport(reportId).then((d) => setReport(d.report)).catch((e) => setError(e.message));
  }, [reportId]);

  if (error) return <ErrorBox message={error} />;
  if (!report) return <Spinner label="Loading report..." />;
  const snap = report.snapshot || {};

  return (
    <>
      <button onClick={() => navigate('/app/reports')} className="no-print mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> All reports</button>
      <PageHeader
        title={report.title}
        description={`Generated ${snap.generatedAt ? new Date(snap.generatedAt).toLocaleString() : new Date(report.createdAt).toLocaleString()} · ${snap.rowCount?.toLocaleString?.() ?? '—'} rows analysed`}
        actions={<Button variant="secondary" className="no-print" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / PDF</Button>}
      />
      {report.summary && <Card className="mb-6 p-5"><p className="text-sm text-slate-700 dark:text-slate-300">{report.summary}</p></Card>}

      {snap.kpis?.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {snap.kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}
        </div>
      )}

      {snap.charts?.length > 0 && (
        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          {snap.charts.map((c, i) => (
            <Card key={i} className="p-4">
              <h4 className="mb-2 text-sm font-semibold">{c.title}</h4>
              {Array.isArray(c.data) && c.data.length ? (
                <SnapshotBars data={c.data} />
              ) : (
                <p className="text-sm text-slate-500">No data captured for this chart.</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {snap.insights && (
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Key findings</h3>
          {['summary', 'trends', 'rankings', 'outliers', 'correlations', 'quality', 'recommendations'].map((k) =>
            snap.insights[k]?.length ? (
              <div key={k} className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700 dark:text-slate-300">{snap.insights[k].map((l, i) => <li key={i}>{l}</li>)}</ul>
              </div>
            ) : null
          )}
        </Card>
      )}
      {!snap.insights && !snap.charts?.length && !snap.kpis?.length && (
        <Card className="p-5 text-sm text-slate-500">This report has no captured content.</Card>
      )}
    </>
  );
}

/** Renders captured bars using the first numeric series of the snapshot. */
function SnapshotBars({ data }) {
  const keys = Object.keys(data[0] || {}).filter((k) => k !== 'name');
  const k = keys[0];
  const max = Math.max(...data.map((d) => Number(d[k]) || 0), 1);
  return (
    <div className="space-y-1.5">
      {data.slice(0, 20).map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 truncate text-slate-600 dark:text-slate-400" title={d.name}>{d.name}</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded bg-brand-500" style={{ width: `${((Number(d[k]) || 0) / max) * 100}%` }} />
          </div>
          <span className="w-20 text-right tabular-nums">{Number(d[k] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
      ))}
    </div>
  );
}
