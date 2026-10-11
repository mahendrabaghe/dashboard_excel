import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ApiError } from '../utils/ApiError.js';
import { LIMITS } from '../shared/dataUtils.js';

/**
 * Parses an uploaded file buffer into a raw matrix (array of rows of cell values).
 * The same algorithm runs in the browser for preview (see client/src/services/fileParser.js),
 * and the server result is authoritative.
 */
export function listSheets(buffer, extension) {
  if (extension === 'csv') return ['Sheet1'];
  const wb = readWorkbook(buffer);
  return wb.SheetNames;
}

export function parseFileToMatrix(buffer, extension, sheetName) {
  if (!buffer || buffer.length === 0) throw new ApiError(400, 'The uploaded file is empty.', 'EMPTY_FILE');
  if (buffer.length > LIMITS.MAX_FILE_BYTES) {
    throw ApiError.payloadTooLarge('File is larger than the 10 MB limit.');
  }

  if (extension === 'csv') {
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    const result = Papa.parse(text, {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
    });
    const fatal = result.errors.find((e) => e.type === 'Quotes' && e.code === 'MissingQuotes');
    if (fatal && result.data.length === 0) {
      throw ApiError.unprocessable('The CSV file could not be parsed. Check the quoting and delimiters.');
    }
    return { matrix: result.data, warnings: result.errors.slice(0, 5).map((e) => `Line ${e.row + 1}: ${e.message}`) };
  }

  const wb = readWorkbook(buffer);
  const name = sheetName || wb.SheetNames[0];
  if (!wb.SheetNames.includes(name)) {
    throw ApiError.badRequest(`Sheet "${name}" was not found in the workbook.`);
  }
  const ws = wb.Sheets[name];
  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  return { matrix, warnings: [] };
}

function readWorkbook(buffer) {
  try {
    return XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false });
  } catch {
    throw ApiError.unprocessable('The Excel file could not be read. It may be corrupt or password protected.');
  }
}
