import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { singleFile } from '../middleware/upload.js';
import { schemas } from '../utils/schemas.js';
import * as auth from '../controllers/authController.js';
import * as ds from '../controllers/datasetController.js';
import * as dash from '../controllers/dashboardController.js';
import * as ai from '../controllers/aiController.js';
import { ApiError } from '../utils/ApiError.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in 15 minutes.' } },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many uploads. Please wait before trying again.' } },
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Health (no auth, no DB dependency beyond readyState)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---- Auth ----
router.post('/auth/register', authLimiter, validate(schemas.register), wrap(auth.register));
router.post('/auth/login', authLimiter, validate(schemas.login), wrap(auth.login));
router.get('/auth/me', requireAuth, wrap(auth.me));
router.patch('/auth/me', requireAuth, validate(schemas.updateProfile), wrap(auth.updateProfile));
router.delete('/auth/me', requireAuth, validate(schemas.deleteAccount), wrap(auth.deleteAccount));

// Everything below requires authentication
router.use(requireAuth);

// ---- Datasets ----
router.post('/datasets/inspect', uploadLimiter, singleFile('file'), wrap(ds.inspectFile));
router.post(
  '/datasets',
  uploadLimiter,
  singleFile('file'),
  validate(schemas.uploadBody),
  wrap(ds.uploadDataset)
);
router.get('/datasets', validate(schemas.pagination, 'query'), wrap(ds.listDatasets));
router.get('/datasets/:id', validate(schemas.idParam, 'params'), wrap(ds.getDataset));
router.patch(
  '/datasets/:id',
  validate(schemas.idParam, 'params'),
  validate(schemas.renameDataset),
  wrap(ds.updateDataset)
);
router.delete('/datasets/:id', validate(schemas.idParam, 'params'), wrap(ds.removeDataset));
router.get('/datasets/:id/chunks/:index', validate(schemas.chunkParam, 'params'), wrap(ds.getChunk));
router.get('/datasets/:id/transformations', validate(schemas.idParam, 'params'), wrap(ds.getTransformations));
router.put(
  '/datasets/:id/transformations',
  validate(schemas.idParam, 'params'),
  validate(schemas.transformations),
  wrap(ds.saveTransformations)
);

// ---- Dashboards ----
router.get('/dashboards', validate(schemas.dashboardQuery, 'query'), wrap(dash.listDashboards));
router.post('/dashboards', validate(schemas.dashboardCreate), wrap(dash.createDashboard));
router.get('/dashboards/:id', validate(schemas.idParam, 'params'), wrap(dash.getDashboard));
router.patch(
  '/dashboards/:id',
  validate(schemas.idParam, 'params'),
  validate(schemas.dashboardUpdate),
  wrap(dash.updateDashboard)
);
router.post(
  '/dashboards/:id/duplicate',
  validate(schemas.idParam, 'params'),
  validate(schemas.dashboardDuplicate),
  wrap(dash.duplicateDashboard)
);
router.delete('/dashboards/:id', validate(schemas.idParam, 'params'), wrap(dash.deleteDashboard));

// ---- Reports ----
router.get('/reports', wrap(dash.listReports));
router.post('/reports', validate(schemas.reportCreate), wrap(dash.createReport));
router.get('/reports/:id', validate(schemas.idParam, 'params'), wrap(dash.getReport));
router.delete('/reports/:id', validate(schemas.idParam, 'params'), wrap(dash.deleteReport));

// ---- AI ----
router.get('/ai/status', wrap(ai.aiStatus));
router.post('/ai/ask', rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }), validate(schemas.aiAsk), wrap(ai.askAI));

// Guard for unknown API paths under the authenticated router
router.all('*', (req, _res, next) => next(ApiError.notFound(`Unknown API route: ${req.method} ${req.path}`)));

export default router;
