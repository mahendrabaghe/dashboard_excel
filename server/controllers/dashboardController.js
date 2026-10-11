import { Dashboard } from '../models/Dashboard.js';
import { Report } from '../models/Report.js';
import { ApiError } from '../utils/ApiError.js';
import { getOwnedDataset } from '../services/datasetService.js';

const serialize = (d) => ({
  id: d._id.toString(),
  datasetId: d.dataset.toString(),
  name: d.name,
  description: d.description,
  theme: d.theme,
  globalFilters: d.globalFilters,
  widgets: d.widgets,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

async function getOwnedDashboard(ownerId, id) {
  const d = await Dashboard.findOne({ _id: id, owner: ownerId });
  if (!d) throw ApiError.notFound('Dashboard not found.');
  return d;
}

export async function listDashboards(req, res) {
  const filter = { owner: req.user._id };
  if (req.query.datasetId) filter.dataset = req.query.datasetId;
  const items = await Dashboard.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ items: items.map((d) => serialize({ ...d, _id: d._id })) });
}

export async function createDashboard(req, res) {
  // Ownership check: the dataset must belong to the requesting user
  await getOwnedDataset(req.user._id, req.body.datasetId);
  const d = await Dashboard.create({
    owner: req.user._id,
    dataset: req.body.datasetId,
    name: req.body.name,
    description: req.body.description || '',
    theme: req.body.theme || 'system',
    globalFilters: req.body.globalFilters || { logic: 'AND', groups: [] },
    widgets: req.body.widgets || [],
  });
  res.status(201).json({ dashboard: serialize(d) });
}

export async function getDashboard(req, res) {
  const d = await getOwnedDashboard(req.user._id, req.params.id);
  res.json({ dashboard: serialize(d) });
}

export async function updateDashboard(req, res) {
  const d = await getOwnedDashboard(req.user._id, req.params.id);
  for (const key of ['name', 'description', 'theme', 'globalFilters', 'widgets']) {
    if (req.body[key] !== undefined) d[key] = req.body[key];
  }
  await d.save();
  res.json({ dashboard: serialize(d) });
}

export async function duplicateDashboard(req, res) {
  const src = await getOwnedDashboard(req.user._id, req.params.id);
  const copy = await Dashboard.create({
    owner: req.user._id,
    dataset: src.dataset,
    name: req.body?.name || `${src.name} (copy)`,
    description: src.description,
    theme: src.theme,
    globalFilters: src.globalFilters,
    widgets: src.widgets.map((w) => w.toObject()),
  });
  res.status(201).json({ dashboard: serialize(copy) });
}

export async function deleteDashboard(req, res) {
  const d = await getOwnedDashboard(req.user._id, req.params.id);
  await d.deleteOne();
  res.status(204).end();
}

/* ---------------- Reports ---------------- */

const serializeReport = (r) => ({
  id: r._id.toString(),
  datasetId: r.dataset.toString(),
  dashboardId: r.dashboard ? r.dashboard.toString() : null,
  title: r.title,
  summary: r.summary,
  snapshot: r.snapshot,
  createdAt: r.createdAt,
});

export async function listReports(req, res) {
  const items = await Report.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .select('-snapshot')
    .lean();
  res.json({
    items: items.map((r) => ({
      id: r._id.toString(),
      datasetId: r.dataset.toString(),
      title: r.title,
      summary: r.summary,
      createdAt: r.createdAt,
    })),
  });
}

export async function createReport(req, res) {
  await getOwnedDataset(req.user._id, req.body.datasetId);
  if (req.body.dashboardId) await getOwnedDashboard(req.user._id, req.body.dashboardId);
  const r = await Report.create({
    owner: req.user._id,
    dataset: req.body.datasetId,
    dashboard: req.body.dashboardId || null,
    title: req.body.title,
    summary: req.body.summary || '',
    snapshot: req.body.snapshot || {},
  });
  res.status(201).json({ report: serializeReport(r) });
}

export async function getReport(req, res) {
  const r = await Report.findOne({ _id: req.params.id, owner: req.user._id }).lean();
  if (!r) throw ApiError.notFound('Report not found.');
  res.json({ report: serializeReport(r) });
}

export async function deleteReport(req, res) {
  const r = await Report.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!r) throw ApiError.notFound('Report not found.');
  res.status(204).end();
}
