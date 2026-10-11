/**
 * Browser-side file preview. Parses the file locally so the user sees real data
 * before uploading. The server re-parses with the same shared normaliser, so the
 * stored dataset matches the preview.
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { normalizeTable } from '@shared/parseTable.js';
import { LIMITS, ALLOWED_EXTENSIONS } from '@shared/dataUtils.js';

export function getExtension(name = '') {
  return name.split('.').pop().toLowerCase();
}

/** Validates file type and size on the client. Returns an error message or null. */
export function validateFile(file) {
  if (!file) return 'No file selected.';
  const ext = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return 'Unsupported file type. Upload a .csv, .xlsx or .xls file.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > LIMITS.MAX_FILE_BYTES) {
    return `File is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${LIMITS.MAX_FILE_BYTES / 1048576} MB.`;
  }
  return null;
}

async function readWorkbook(file) {
  const buffer = await file.arrayBuffer();
  try {
    return XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    throw new Error('The Excel file could not be read. It may be corrupt or password protected.');
  }
}

/** Returns the sheet names of an Excel file (or ['Sheet1'] for CSV). */
export async function listSheets(file) {
  if (getExtension(file.name) === 'csv') return [];
  const wb = await readWorkbook(file);
  return wb.SheetNames;
}

/**
 * Parses the file into a typed table preview.
 * @returns {Promise<{ table, matrixRowCount, sheetNames, sheetName, warnings }>}
 */
export async function previewFile(file, sheetName) {
  const err = validateFile(file);
  if (err) throw new Error(err);
  const ext = getExtension(file.name);
  let matrix;
  let sheetNames = [];
  let chosen = '';

  if (ext === 'csv') {
    const text = await file.text();
    const res = Papa.parse(text.replace(/^\uFEFF/, ''), { header: false, skipEmptyLines: 'greedy' });
    matrix = res.data;
  } else {
    const wb = await readWorkbook(file);
    sheetNames = wb.SheetNames;
    chosen = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
    const ws = wb.Sheets[chosen];
    matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  }

  const table = normalizeTable(matrix);
  return {
    table,
    sheetNames,
    sheetName: chosen,
    warnings: table.warnings,
  };
}
