import mongoose from 'mongoose';

/**
 * Stores the RAW imported rows of a dataset in fixed-size chunks.
 * The raw data is never mutated: cleaning is stored as transformations and
 * the cleaned table is materialised by the client (or re-derived on export).
 */
const datasetChunkSchema = new mongoose.Schema(
  {
    dataset: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    index: { type: Number, required: true, min: 0 },
    // Rows are arrays aligned with Dataset.columns
    rows: { type: Array, default: [] },
  },
  { timestamps: false }
);

datasetChunkSchema.index({ dataset: 1, index: 1 }, { unique: true });

export const DatasetChunk = mongoose.model('DatasetChunk', datasetChunkSchema);
