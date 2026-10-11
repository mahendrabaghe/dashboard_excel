import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Database, UploadCloud, LayoutPanelTop, FileText, Rows3, Columns3, ArrowRight } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader, Card, Button, Stat, Spinner, ErrorBox, EmptyState, Badge } from '../components/ui/index.jsx';
import { formatNumber } from '@shared/dataUtils.js';

export default function OverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    Promise.all([api.listDatasets(1, 6), api.listDashboards(), api.listReports()])
      .then(([ds, db, rp]) => setData({ datasets: ds, dashboards: db.items, reports: rp.items }))
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Spinner label="Loading overview..." />;

  const totalRows = data.datasets.items.reduce((s, d) => s + (d.rowCount || 0), 0);
  const totalCols = data.datasets.items.reduce((s, d) => s + (d.columnCount || 0), 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || 'there'}`}
        description="Here is what is happening across your datasets, dashboards and reports."
        actions={<Link to="/app/upload"><Button><UploadCloud className="h-4 w-4" /> Upload data</Button></Link>}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Datasets" value={formatNumber(data.datasets.total, 0)} icon={Database} hint="Imported files" />
        <Stat label="Rows (recent)" value={formatNumber(totalRows, 0)} icon={Rows3} hint="Across your 6 most recent datasets" />
        <Stat label="Columns (recent)" value={formatNumber(totalCols, 0)} icon={Columns3} hint="Across your 6 most recent datasets" />
        <Stat label="Dashboards" value={formatNumber(data.dashboards.length, 0)} icon={LayoutPanelTop} hint={`${data.reports.length} saved report(s)`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="font-semibold">Recent datasets</h3>
            <Link to="/app/datasets" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {data.datasets.items.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Database} title="No datasets yet" description="Upload a CSV or Excel file. DataPulse detects columns and builds charts and KPIs for you." action={<Button onClick={() => navigate('/app/upload')}>Upload a file</Button>} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.datasets.items.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-xs text-slate-500">{formatNumber(d.rowCount, 0)} rows · {d.columnCount} columns · {new Date(d.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <Badge tone={d.status === 'ready' ? 'good' : 'warn'}>{d.status}</Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/app/explorer/${d.id}`)}>Explore</Button>
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/app/charts/${d.id}`)}>Charts</Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/app/insights/${d.id}`)}>Insights</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold">Quick actions</h3>
          <div className="mt-4 space-y-2">
            {[
              ['/app/upload', 'Import a new file', UploadCloud],
              ['/app/dashboards', 'Build a dashboard', LayoutPanelTop],
              ['/app/insights', 'Ask a question of your data', FileText],
            ].map(([to, label, Icon]) => (
              <Link key={to} to={to} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-700 dark:hover:bg-slate-800">
                <Icon className="h-5 w-5 text-brand-600" />
                <span className="text-sm font-medium">{label}</span>
                <ArrowRight className="ml-auto h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            Limits: 10 MB per file, 200,000 rows and 200 columns per dataset. Your data is visible only to your account.
          </div>
        </Card>
      </div>
    </>
  );
}
