import multer from 'multer';
import path from 'path';
import { ApiError } from '../utils/ApiError.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(['.csv', '.xlsx', '.xls']);
const ALLOWED_MIME = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some browsers report this for xls/csv
]);

const storage = multer.memoryStorage();

const multerInstance = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED.has(ext)) {
      return cb(ApiError.badRequest('Unsupported file type. Upload a .csv, .xlsx or .xls file.'));
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
      return cb(ApiError.badRequest(`Unexpected file content type "${file.mimetype}".`));
    }
    return cb(null, true);
  },
});

/** Wraps multer so that its errors become ApiError responses. */
export function singleFile(field = 'file') {
  return (req, res, next) => {
    multerInstance.single(field)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.payloadTooLarge('File is larger than the 10 MB limit.'));
      }
      if (err instanceof ApiError) return next(err);
      return next(ApiError.badRequest(err.message || 'Upload failed.'));
    });
  };
}
