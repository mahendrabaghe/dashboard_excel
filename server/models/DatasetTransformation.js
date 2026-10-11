import mongoose from 'mongoose';

/**
 * A persisted, ordered cleaning operation (e.g. "rename column", "fill missing").
 * Replaying the list on top of the raw chunks reproduces the cleaned dataset,
 * so the original import is always preserved and any step can be reverted.
 */
const datasetTransformationSchema = new mongoose.Schema(
  {
    dataset: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sequence: { type: Number, required: true, min: 1 },
    operation: { type: String, required: true, maxlength: 60 },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    description: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

datasetTransformationSchema.index({ dataset: 1, sequence: 1 }, { unique: true });

export const DatasetTransformation = mongoose.model(
  'DatasetTransformation',
  datasetTransformationSchema
);
