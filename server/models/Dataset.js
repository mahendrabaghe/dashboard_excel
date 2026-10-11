import mongoose from 'mongoose';

/**
 * Dataset metadata. Raw row data lives in DatasetChunk documents (bounded size)
 * so no single MongoDB document approaches the 16 MB BSON limit.
 */
const columnSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, maxlength: 16 },
    name: { type: String, required: true, maxlength: 255 },
    type: { type: String, enum: ['text', 'number', 'date', 'boolean'], default: 'text' },
    missing: { type: Number, default: 0 },
    unique: { type: Number, default: 0 },
  },
  { _id: false }
);

const datasetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['processing', 'ready', 'failed'], default: 'processing' },
    source: {
      originalName: { type: String, required: true, maxlength: 255 },
      extension: { type: String, enum: ['csv', 'xlsx', 'xls'], required: true },
      mimeType: { type: String, default: '' },
      sizeBytes: { type: Number, required: true, min: 0 },
      sheetName: { type: String, default: '' },
      sheetNames: [{ type: String }],
      importedAt: { type: Date, default: Date.now },
    },
    rowCount: { type: Number, default: 0 },
    columnCount: { type: Number, default: 0 },
    columns: { type: [columnSchema], default: [] },
    processing: {
      chunkSize: { type: Number, default: 1000 },
      chunkCount: { type: Number, default: 0 },
      duplicateHeaders: [{ type: String }],
      droppedEmptyRows: { type: Number, default: 0 },
      invalidCells: { type: Number, default: 0 },
      warnings: [{ type: String }],
    },
  },
  { timestamps: true }
);

datasetSchema.index({ owner: 1, updatedAt: -1 });

export const Dataset = mongoose.model('Dataset', datasetSchema);
