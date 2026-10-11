import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/** Triggers a browser download of a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (s) => (s || 'export').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'export';

/** Exports a working table (columns + rows) as CSV. Values are written as displayed. */
export function exportCsv(table, rows, baseName) {
  const header = table.columns.map((c) => c.name);
  const data = rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : v)));
  const csv = Papa.unparse({ fields: header, data });
  downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `${safeName(baseName)}.csv`);
}

/** Exports a working table as an .xlsx workbook. */
export function exportXlsx(table, rows, baseName, sheetName = 'Data') {
  const aoa = [table.columns.map((c) => c.name), ...rows.map((r) => r.map((v) => (v === undefined ? null : v)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${safeName(baseName)}.xlsx`);
}

/** Summary statistics as CSV or XLSX. */
export function exportSummary(stats, baseName, format = 'csv') {
  const headers = ['column', 'type', 'count', 'missing', 'unique', 'min', 'max', 'mean', 'median', 'stddev'];
  const rows = stats.map((s) => headers.map((h) => (s[h] === null || s[h] === undefined ? '' : s[h])));
  if (format === 'xlsx') {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    XLSX.writeFile(wb, `${safeName(baseName)}_summary.xlsx`);
  } else {
    const csv = Papa.unparse({ fields: headers, data: rows });
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `${safeName(baseName)}_summary.csv`);
  }
}

/** Exports a rendered chart SVG (inside `container`) as a PNG image. */
export async function exportChartPng(container, baseName) {
  const svg = container?.querySelector('svg.recharts-surface');
  if (!svg) throw new Error('Chart is not rendered yet.');
  const xml = new XMLSerializer().serializeToString(svg);
  const { width, height } = svg.getBoundingClientRect();
  const scale = 2;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Could not render chart image.'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  await new Promise((resolve) => canvas.toBlob((b) => { downloadBlob(b, `${safeName(baseName)}.png`); resolve(); }, 'image/png'));
}
