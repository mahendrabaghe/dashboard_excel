import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');
const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/\d/, 'Password must contain a number.');

export const schemas = {
  register: z.object({
    name: z.string().trim().min(1, 'Name is required.').max(80),
    email,
    password,
  }),
  login: z.object({
    email,
    password: z.string().min(1, 'Password is required.').max(128),
  }),
  updateProfile: z.object({
    name: z.string().trim().min(1).max(80).optional(),
    preferences: z
      .object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        defaultCurrency: z.string().length(3).optional(),
      })
      .optional(),
    currentPassword: z.string().max(128).optional(),
    newPassword: password.optional(),
  }),
  deleteAccount: z.object({ password: z.string().min(1).max(128) }),

  idParam: z.object({ id: objectId }),
  chunkParam: z.object({
    id: objectId,
    index: z.coerce.number().int().min(0),
  }),
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),

  uploadBody: z.object({
    name: z.string().trim().max(120).optional(),
    sheetName: z.string().max(255).optional(),
  }),

  renameDataset: z.object({ name: z.string().trim().min(1).max(120) }),

  transformations: z.object({
    operations: z
      .array(
        z.object({
          operation: z.string().min(1).max(60),
          params: z.record(z.any()).optional(),
          description: z.string().max(300).optional(),
        })
      )
      .max(2000),
  }),

  dashboardCreate: z.object({
    datasetId: objectId,
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    globalFilters: z.any().optional(),
    widgets: z.array(z.any()).max(60).optional(),
  }),
  dashboardUpdate: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(500).optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
      globalFilters: z.any().optional(),
      widgets: z.array(z.any()).max(60).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update.'),
  dashboardDuplicate: z.object({ name: z.string().trim().min(1).max(120).optional() }).optional(),
  dashboardQuery: z.object({ datasetId: objectId.optional() }),

  reportCreate: z.object({
    datasetId: objectId,
    dashboardId: objectId.nullable().optional(),
    title: z.string().trim().min(1).max(160),
    summary: z.string().max(4000).optional(),
    snapshot: z.any(),
  }),

  aiAsk: z.object({
    datasetId: objectId,
    question: z.string().trim().min(3).max(500),
    consent: z.boolean(),
    summary: z.any(),
  }),
};
