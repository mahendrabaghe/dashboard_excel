import { Dataset } from '../models/Dataset.js';
import { DatasetChunk } from '../models/DatasetChunk.js';
import { ApiError } from '../utils/ApiError.js';
import { LIMITS } from '../shared/dataUtils.js';
import { listSheets } from '../services/fileParser.js';
import path from 'path';
import {
  importDataset,
  getOwnedDataset,
  deleteDatasetCascade,
  replaceTransformations,
  listTransformations,
} from '../services/datasetService.js';

const serialize = (d) => ({
  id: d._id.toString(),
  name: d.name,
  status: d.status,
  source: d.source,
  rowCount: d.rowCount,
  columnCount: d.columnCount,
  columns: d.columns,
  processing: d.processing,
  chunkSize: d.processing?.chunkSize || LIMITS.CHUNK_SIZE,
  chunkCount: d.processing?.chunkCount || 0,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

/** Lists sheet names in an uploaded workbook before importing (used by the upload wizard). */
export async function inspectFile(req, res) {
  if (!req.file) throw ApiError.badRequest('No file was uploaded.');
  const extension = path.extname(req.file.originalname).slice(1).toLowerCase();
  res.json({ extension, sheets: listSheets(req.file.buffer, extension) });
}

export async function uploadDataset(req, res) {
  if (!req.file) throw ApiError.badRequest('No file was uploaded.');
  const dataset = await importDataset({
    owner: req.user._id,
    file: req.file,
    name: req.body.name,
    sheetName: req.body.sheetName,
  });
  res.status(201).json({ dataset: serialize(dataset) });
}

export async function listDatasets(req, res) {
  const page = req.query.page;
  const limit = req.query.limit;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Dataset.find({ owner: req.user._id }).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Dataset.countDocuments({ owner: req.user._id }),
  ]);
  res.json({
    items: items.map((d) => serialize({ ...d, _id: d._id, processing: d.processing })),
    page,
    limit,
    total,
  });
}

export async function getDataset(req, res) {
  const dataset = await getOwnedDataset(req.user._id, req.params.id);
  res.json({ dataset: serialize(dataset) });
}

export async function updateDataset(req, res) {
  const dataset = await getOwnedDataset(req.user._id, req.params.id);
  if (req.body.name !== undefined) dataset.name = req.body.name;
  await dataset.save();
  res.json({ dataset: serialize(dataset) });
}

export async function removeDataset(req, res) {
  await deleteDatasetCascade(req.user._id, req.params.id);
  res.status(204).end();
}

/** Returns one chunk of raw (imported, never mutated) rows. Rows align with dataset.columns. */
export async function getChunk(req, res) {
  const dataset = await getOwnedDataset(req.user._id, req.params.id);
  const index = req.params.index;
  if (index >= dataset.processing.chunkCount) throw ApiError.notFound('Chunk not found.');
  const chunk = await DatasetChunk.findOne({
    dataset: dataset._id,
    owner: req.user._id,
    index,
  }).lean();
  if (!chunk) throw ApiError.notFound('Chunk not found.');
  res.json({ index, rows: chunk.rows });
}

export async function getTransformations(req, res) {
  const dataset = await getOwnedDataset(req.user._id, req.params.id);
  const ops = await listTransformations(req.user._id, dataset._id);
  res.json({
    items: ops.map((o) => ({
      sequence: o.sequence,
      operation: o.operation,
      params: o.params,
      description: o.description,
    })),
  });
}

/** Persists the complete ordered cleaning log. Raw chunks are untouched. */
export async function saveTransformations(req, res) {
  const dataset = await getOwnedDataset(req.user._id, req.params.id);
  const count = await replaceTransformations(req.user._id, dataset, req.body.operations);
  res.json({ count });
}
