import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles, Send, Lightbulb, AlertTriangle, TrendingUp, Trophy, Activity, Target, ShieldCheck, FileText, Bot } from 'lucide-react';
import { DatasetPicker } from '../components/DatasetPicker.jsx';
import { useWorkingDataset } from '../hooks/useWorkingDataset.js';
import { PageHeader, Card, CardHeader, Button, Spinner, ErrorBox, EmptyState, Input } from '../components/ui/index.jsx';
import { buildInsights, answerQuestion, buildAiSummary } from '../utils/insights.js';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { ChartRenderer } from '../components/charts/ChartRenderer.jsx';
import { computeKpis, primaryMetric, primaryCategory, primaryDate } from '../utils/analytics.js';
import { recommendWidgets } from '../utils/recommend.js';
import { KpiCard } from '../components/dashboard/KpiCard.jsx';
import { cn } from '../lib/utils.js';

const SECTIONS = [
  ['summary', 'Dataset summary', Sparkles],
  ['trends', 'Trends & patterns', TrendingUp],
  ['rankings', 'Top & lowest performers', Trophy],
  ['outliers', 'Unusual values & outliers', AlertTriangle],
  ['correlations', 'Correlations', Activity],
  ['quality', 'Data quality', ShieldCheck],
  ['suggestions', 'Suggested charts & KPIs', Lightbulb],
  ['recommendations', 'Business recommendations', Target],
];

const SUGGESTED_QUESTIONS = [
  'What are the most important trends in this dataset?',
  'Which category has the highest sales?',
  'How has performance changed over time?',
  'Are there unusual values in the data?',
  'Which variables appear to be correlated?',
];

export default function InsightsPage() {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const ds = useWorkingDataset(datasetId);
  const { table, profile, status, error } = ds;
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState([]);
  const [aiStatus, setAiStatus] = useState({ configured: false });
  const [useAi, setUseAi] = useState(false);
  const [consent, setConsent] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus({ configured: false }));
  }, []);
  useEffect(() => setChat([]), [datasetId]);

  const rows = table ? table.rows : [];
  const insights = useMemo(() => (table ? buildInsights(table, rows, profile) : null), [table, rows, profile]);
  const kpis = useMemo(() => (table ? computeKpis(table, rows, profile) : []), [table, rows, profile]);
  const suggestedWidgets = useMemo(() => (table ? recommendWidgets(table, rows, profile).filter((w) => w.type === 'chart').slice(0, 4) : []), [table, rows, profile]);

  if (!datasetId) {
    return (
      <>
        <PageHeader title="AI Insights" description="Automatic analysis of your real data, plus a question interface." />
        <Card className="p-5"><label className="label">Choose a dataset</label><DatasetPicker value="" onChange={(id) => id && navigate(`/app/insights/${id}`)} className="max-w-md" /></Card>
      </>
    );
  }
  if (status === 'loading' || status === 'idle') return <Spinner label="Analysing dataset..." />;
  if (status === 'error') return <ErrorBox message={error} onRetry={ds.reload} />;
  if (!table || !insights) return null;

  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion('');
    setAsking(true);
    const local = answerQuestion(text, table, rows, profile);
    let entry = { q: text, a: local.answer, bullets: local.bullets, source: 'local' };
    if (useAi && aiStatus.configured) {
      if (!consent) {
        toast.error('Confirm consent before sending a summary to the AI provider.');
        setAsking(false);
        return;
      }
      try {
        const res = await api.askAI({ datasetId, question: text, consent: true, summary: buildAiSummary(table, rows, profile) });
        entry = { q: text, a: res.answer, bullets: local.bullets, source: 'ai' };
      } catch (e) {
        toast.error(`${e.message} Showing local analysis instead.`);
      }
    }
    setChat((c) => [entry, ...c].slice(0, 30));
    setAsking(false);
  };

  const saveReport = async () => {
    try {
      const snapshot = {
        generatedAt: new Date().toISOString(),
        kpis: kpis.map((k) => ({ label: k.label, value: k.value, format: k.format })),
        insights,
        charts: suggestedWidgets.map((w) => ({ title: w.title, config: w.config })),
        rowCount: rows.length,
      };
      await api.createReport({
        datasetId,
        title: `${ds.dataset.name} — insights report`,
        summary: insights.summary.join(' ').slice(0, 4000),
        snapshot,
      });
      toast.success('Insights report saved.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const metric = primaryMetric(profile);
  const cat = primaryCategory(profile, rows.length);
  const dateCol = primaryDate(profile);

  return (
    <>
      <PageHeader
        title="AI Insights"
        description={`Analysis of ${rows.length.toLocaleString()} rows in "${ds.dataset.name}". All numbers come from your data.`}
        actions={
          <>
            <DatasetPicker value={datasetId} onChange={(id) => id && navigate(`/app/insights/${id}`)} className="w-56" />
            <Button variant="secondary" onClick={saveReport}><FileText className="h-4 w-4" /> Save as report</Button>
          </>
        }
      />

      {kpis.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {kpis.slice(0, 4).map((k) => <KpiCard key={k.id} kpi={k} />)}
        </div>
      )}

      {/* Question interface */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title="Ask your data"
          description={metric || cat || dateCol ? 'Ask about trends, rankings, outliers or correlations.' : 'Ask a question about the dataset.'}
          actions={
            <label className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs', aiStatus.configured ? 'border-brand-200 text-brand-700 dark:border-brand-800 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-slate-700')}>
              <Bot className="h-3.5 w-3.5" />
              {aiStatus.configured ? (
                <>
                  <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                  Use AI ({aiStatus.model})
                </>
              ) : 'Local analysis (AI not configured)'}
            </label>
          }
        />
        <div className="space-y-4 p-5">
          {useAi && aiStatus.configured && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              I consent to sending an aggregated statistical summary of this dataset (column names, counts, min/max/mean and correlations; never raw rows) to the AI provider configured by the server.
            </label>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Which category has the highest sales?" aria-label="Question" maxLength={500} />
            <Button type="submit" loading={asking} disabled={!question.trim()}><Send className="h-4 w-4" /> Ask</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button key={q} onClick={() => ask(q)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-brand-300 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{q}</button>
            ))}
          </div>
          {chat.length === 0 && <p className="text-sm text-slate-500">Answers appear here. Local analysis is computed in your browser from the cleaned dataset.</p>}
          <div className="space-y-3">
            {chat.map((m, i) => (
              <div key={i} className="animate-fade-in rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-sm font-medium">{m.q}</p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{m.a}</p>
                {m.bullets.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">{m.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
                <span className="mt-2 inline-block text-[11px] uppercase tracking-wide text-slate-400">{m.source === 'ai' ? 'AI answer grounded in dataset statistics' : 'Local statistical analysis'}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {SECTIONS.map(([key, title, Icon]) => (
          <Card key={key} className={cn('p-5', (key === 'summary' || key === 'recommendations') && 'lg:col-span-2')}>
            <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-brand-600" /> {title}</h3>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              {insights[key].map((line, i) => (
                <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{line}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {suggestedWidgets.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-semibold">Suggested visualisations</h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {suggestedWidgets.map((w) => (
              <Card key={w.id} className="p-4">
                <h4 className="mb-1 text-sm font-semibold">{w.title}</h4>
                <p className="mb-3 text-xs text-slate-500">{w.description}</p>
                <ChartRenderer table={table} rows={rows} profile={profile} config={{ ...w.config }} height={220} />
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
