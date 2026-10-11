import mongoose from 'mongoose';

const widgetSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, maxlength: 64 },
    type: {
      type: String,
      enum: ['kpi', 'chart', 'table', 'text', 'filter'],
      required: true,
    },
    title: { type: String, default: '', maxlength: 160 },
    description: { type: String, default: '', maxlength: 500 },
    // Chart / KPI / table settings (validated loosely; semantic checks happen client-side)
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Grid placement: 12-column grid
    layout: {
      x: { type: Number, default: 0, min: 0, max: 11 },
      y: { type: Number, default: 0, min: 0 },
      w: { type: Number, default: 6, min: 1, max: 12 },
      h: { type: Number, default: 4, min: 1, max: 60 },
    },
  },
  { _id: false }
);

const dashboardSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dataset: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    globalFilters: { type: mongoose.Schema.Types.Mixed, default: { groups: [], logic: 'AND' } },
    widgets: { type: [widgetSchema], default: [] },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
  },
  { timestamps: true }
);

dashboardSchema.index({ owner: 1, updatedAt: -1 });

export const Dashboard = mongoose.model('Dashboard', dashboardSchema);
