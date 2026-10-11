import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileSpreadsheet, FileText, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Input, Field, Select, Badge, ErrorBox } from '../components/ui/index.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { previewFile, validateFile, getExtension } from '../services/fileParser.js';
import { uploadWithProgress } from '../services/api.js';
import { formatBytes, formatNumber, LIMITS } from '@shared/dataUtils.js';
import { cn } from '../lib/utils.js';

const TYPE_TONE = { number: 'brand', date: 'warn', boolean: 'good', text: 'default' };

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [name, setName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const toast = useToast();
  const navigate = useNavigate();

  const loadFile = useCallback(
    async (f, sheet) => {
      const err = validateFile(f);
      if (err) {
        setError(err);
        toast.error(err);
        return;
      }
      setParsing(true);
      setError('');
      try {
        const res = await previewFile(f, sheet);
        setPreview(res);
        setSheetName(res.sheetName);
      } catch (e) {
        setPreview(null);
        setError(e.message);
        toast.error(e.message);
      } finally {
        setParsing(false);
      }
    },
    [toast]
  );

  const pick = (f) => {
    if (!f) return;
    setFile(f);
    setName(f.name.replace(/\.[^.]+$/, ''));
    setPreview(null);
    loadFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const changeSheet = (s) => {
    setSheetName(s);
    loadFile(file, s);
  };

  const doUpload = async () => {
    if (!file || !preview) return;
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name.trim() || file.name);
      if (sheetName) fd.append('sheetName', sheetName);
      const res = await uploadWithProgress('/datasets', fd, setProgress);
      toast.success(`Imported "${res.dataset.name}" with ${formatNumber(res.dataset.rowCount, 0)} rows.`);
      navigate(`/app/explorer/${res.dataset.id}`);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const ext = file ? getExtension(file.name) : '';
  const Icon = ext === 'csv' ? FileText : FileSpreadsheet;

  return (
    <>
      <PageHeader title="Upload data" description={`Import a CSV or Excel file (.csv, .xlsx, .xls). Max ${LIMITS.MAX_FILE_BYTES / 1048576} MB, ${LIMITS.MAX_ROWS.toLocaleString()} rows, ${LIMITS.MAX_COLS} columns.`} />

      {!file && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload file drop zone"
          className={cn(
            'group grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-20 text-center transition-all duration-200',
            dragging ? 'scale-[1.01] border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-900/60'
          )}
        >
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 transition-transform group-hover:-translate-y-1 dark:bg-brand-900/40 dark:text-brand-300">
              <UploadCloud className="h-8 w-8" />
            </div>
            <p className="mt-4 text-lg font-semibold">Drag and drop your file here</p>
            <p className="mt-1 text-sm text-slate-500">or click to browse from your device</p>
            <Button className="mt-5" variant="secondary" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
              Browse files
            </Button>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {error && !preview && <div className="mt-4"><ErrorBox message={error} /></div>}

      {file && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={file.name}>{file.name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(file.size)} · {ext.toUpperCase()}</p>
                </div>
                <button onClick={reset} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" aria-label="Remove file" disabled={uploading}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              {preview && (
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                    <dt className="text-xs text-slate-500">Rows</dt>
                    <dd className="text-lg font-semibold tabular-nums">{formatNumber(preview.table.rows.length, 0)}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                    <dt className="text-xs text-slate-500">Columns</dt>
                    <dd className="text-lg font-semibold tabular-nums">{preview.table.columns.length}</dd>
                  </div>
                </dl>
              )}

              {preview && preview.sheetNames.length > 1 && (
                <div className="mt-5">
                  <Field label="Sheet to import" hint={`${preview.sheetNames.length} sheets found in this workbook.`}>
                    <Select value={sheetName} onChange={(e) => changeSheet(e.target.value)} disabled={parsing || uploading}>
                      {preview.sheetNames.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </Field>
                </div>
              )}

              <div className="mt-5">
                <Field label="Dataset name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={uploading} />
                </Field>
              </div>

              {uploading && (
                <div className="mt-5" aria-live="polite">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>{progress < 100 ? 'Uploading and validating...' : 'Saving to database...'}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {error && preview && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

              <Button className="mt-6 w-full" size="lg" onClick={doUpload} loading={uploading} disabled={!preview || parsing}>
                {parsing ? 'Parsing file...' : 'Import dataset'}
              </Button>
            </Card>

            {preview?.warnings?.length > 0 && (
              <Card className="p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" /> Validation notes
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </Card>
            )}
          </div>

          <div className="min-w-0 space-y-6">
            {parsing && <Card className="grid h-72 place-items-center text-sm text-slate-500">Parsing and detecting column types...</Card>}
            {preview && (
              <>
                <Card className="overflow-hidden">
                  <CardHeader title="Detected columns" description="Types are inferred from the values. You can change them later in Data Explorer." actions={<Badge tone="good"><CheckCircle2 className="mr-1 h-3 w-3" />Ready</Badge>} />
                  <div className="flex flex-wrap gap-2 p-5">
                    {preview.table.columns.map((c) => (
                      <div key={c.key} className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                        <p className="max-w-[180px] truncate text-sm font-medium" title={c.name}>{c.name}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <Badge tone={TYPE_TONE[c.type]}>{c.type}</Badge>
                          {c.missing > 0 && <span className="text-amber-600">{c.missing} missing</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="overflow-hidden">
                  <CardHeader title="Data preview" description={`First ${Math.min(50, preview.table.rows.length)} of ${preview.table.rows.length.toLocaleString()} rows`} />
                  <div className="max-h-[480px] overflow-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="th w-12 text-right">#</th>
                          {preview.table.columns.map((c) => <th key={c.key} className="th">{c.name}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.table.rows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="td text-right text-xs text-slate-400">{i + 1}</td>
                            {r.map((v, j) => (
                              <td key={j} className="td max-w-[260px] truncate" title={String(v ?? '')}>
                                {v === null ? <span className="text-slate-300">—</span> : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
