import path from 'path';
import { Dataset } from '../models/Dataset.js';
import { DatasetChunk } from '../models/DatasetChunk.js';
import { DatasetTransformation } from '../models/DatasetTransformation.js';
import { ApiError } from '../utils/ApiError.js';
import { LIMITS } from '../shared/dataUtils.js';
import { normalizeTable, DataError } from '../shared/parseTable.js';
import { parseFileToMatrix, listSheets } from './fileParser.js';

/** Creates a dataset from an uploaded file; raw rows are stored in chunks. */
export async function importDataset({ owner, file, name, sheetName }) {
  const extension = path.extname(file.originalname).slice(1).toLowerCase();
  const sheetNames = listSheets(file.buffer, extension);
  const chosenSheet = extension === 'csv' ? '' : sheetName || sheetNames[0];

  let parsed;
  let table;
  try {
    parsed = parseFileToMatrix(file.buffer, extension, chosenSheet);
    table = normalizeTable(parsed.matrix);
  } catch (err) {
    if (err instanceof DataError) {
      const status = err.code === 'ROW_LIMIT' || err.code === 'COLUMN_LIMIT' ? 413 : 422;
      throw new ApiError(status, err.message, err.code);
    }
    throw err;
  }

  const dataset = await Dataset.create({
    owner,
    name: name?.trim() || path.basename(file.originalname, path.extname(file.originalname)),
    status: 'processing',
    source: {
      originalName: file.originalname,
      extension,
      mimeType: file.mimetype || '',
      sizeBytes: file.size,
      sheetName: chosenSheet,
      sheetNames,
    },
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    columns: table.columns,
    processing: {
      chunkSize: LIMITS.CHUNK_SIZE,
      chunkCount: Math.ceil(table.rows.length / LIMITS.CHUNK_SIZE),
      duplicateHeaders: table.stats.duplicateHeaders,
      droppedEmptyRows: table.stats.droppedEmptyRows,
      invalidCells: table.stats.invalidCells,
      warnings: [...parsed.warnings, ...table.warnings].slice(0, 30),
    },
  });

  try {
    const chunks = [];
    for (let i = 0, idx = 0; i < table.rows.length; i += LIMITS.CHUNK_SIZE, idx += 1) {
      chunks.push({
        dataset: dataset._id,
        owner,
        index: idx,
        rows: table.rows.slice(i, i + LIMITS.CHUNK_SIZE),
      });
    }
    await DatasetChunk.insertMany(chunks, { ordered: true });
    dataset.status = 'ready';
    await dataset.save();
  } catch (err) {
    // Roll back partially written data so no orphan chunks remain
    await DatasetChunk.deleteMany({ dataset: dataset._id });
    await Dataset.deleteOne({ _id: dataset._id });
    throw err;
  }
  return dataset;
}

/** Loads a dataset the user owns; throws 404 otherwise (never reveals other users' data). */
export async function getOwnedDataset(ownerId, datasetId) {
  const dataset = await Dataset.findOne({ _id: datasetId, owner: ownerId });
  if (!dataset) throw ApiError.notFound('Dataset not found.');
  return dataset;
}

export async function deleteDatasetCascade(ownerId, datasetId) {
  const dataset = await getOwnedDataset(ownerId, datasetId);
  await Promise.all([
    DatasetChunk.deleteMany({ dataset: dataset._id, owner: ownerId }),
    DatasetTransformation.deleteMany({ dataset: dataset._id, owner: ownerId }),
  ]);
  await dataset.deleteOne();
}

/** Replaces the transformation log of a dataset (ordered list, validated by the caller). */
export async function replaceTransformations(ownerId, dataset, operations) {
  await DatasetTransformation.deleteMany({ dataset: dataset._id, owner: ownerId });
  if (operations.length) {
    await DatasetTransformation.insertMany(
      operations.map((op, i) => ({
        dataset: dataset._id,
        owner: ownerId,
        sequence: i + 1,
        operation: op.operation,
        params: op.params || {},
        description: op.description || '',
      }))
    );
  }
  return operations.length;
}

export async function listTransformations(ownerId, datasetId) {
  return DatasetTransformation.find({ dataset: datasetId, owner: ownerId })
    .sort({ sequence: 1 })
    .lean();
}
