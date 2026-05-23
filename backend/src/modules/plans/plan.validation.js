import { z } from 'zod';

import {
  FEATURE_KEY_VALUES,
  PLAN_STATUSES,
  QUOTA_KEY_VALUES,
} from './plan.constants.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code');

const priceSchema = z
  .object({
    amountMinor: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    currency: currencySchema.default('USD'),
    intervalUnit: z.enum(['months', 'years']).default('months'),
    intervalCount: z.coerce.number().int().min(1).max(36).default(1),
  })
  .strict();

const featureMapSchema = z
  .record(z.enum(FEATURE_KEY_VALUES), z.boolean())
  .default({});

// Quota values are integers or `null` (unlimited). Coerce strings so the
// admin form can pass them straight through without manual conversion.
const quotaValueSchema = z.union([
  z.literal(null),
  z.coerce.number().int().min(0).max(1_000_000_000),
]);

const quotaMapSchema = z
  .record(z.enum(QUOTA_KEY_VALUES), quotaValueSchema)
  .default({});

export const createPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'Code must be lowercase, with hyphens or underscores'),
    description: z.string().trim().max(500).optional().nullable(),
    status: z.enum(PLAN_STATUSES).optional().default('draft'),
    isDefault: z.coerce.boolean().optional().default(false),
    price: priceSchema.optional(),
    features: featureMapSchema.optional(),
    quotas: quotaMapSchema.optional(),
    subscriptionPlanId: objectIdSchema.optional().nullable(),
    sortOrder: z.coerce.number().int().optional().default(0),
  })
  .strict();

export const updatePlanSchema = createPlanSchema.partial().strict();

export const updatePlanStatusSchema = z
  .object({ status: z.enum(PLAN_STATUSES) })
  .strict();

export const listPlansQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(PLAN_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
    sort: z
      .enum(['sortOrder', '-sortOrder', 'name', '-name', 'createdAt', '-createdAt'])
      .optional()
      .default('sortOrder'),
  })
  .strict();

export const assignPlanSchema = z
  .object({
    planId: objectIdSchema.optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
    subscriptionId: objectIdSchema.optional().nullable(),
    source: z.enum(['admin', 'subscription', 'system']).optional().default('admin'),
  })
  .strict();
