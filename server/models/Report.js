import mongoose from 'mongoose';

/** A saved report: a frozen snapshot of KPIs, charts and findings for a dataset. */
const reportSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dataset: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
    dashboard: { type: mongoose.Schema.Types.ObjectId, ref: 'Dashboard', default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    summary: { type: String, default: '', maxlength: 4000 },
    // Snapshot: { kpis: [], charts: [], findings: [], filters: {}, generatedAt }
    snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

reportSchema.index({ owner: 1, createdAt: -1 });

export const Report = mongoose.model('Report', reportSchema);
