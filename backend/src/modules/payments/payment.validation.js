import { z } from 'zod';

import { PAYMENT_STATUSES, PAYMENT_PURPOSES } from './payment-transaction.model.js';
import { PLAN_STATUSES, PLAN_INTERVALS } from './subscription-plan.model.js';
import { SUBSCRIPTION_STATUSES } from './tenant-subscription.model.js';
import { WEBHOOK_PROCESSED_STATUSES } from './payment-webhook-event.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');
const optionalEmail = z.string().email().optional().nullable();

export const createTokenPreferenceSchema = z
  .object({
    packageId: objectIdSchema,
    payerEmail: optionalEmail,
  })
  .strict();

export const listTransactionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(PAYMENT_STATUSES).optional(),
    purpose: z.enum(PAYMENT_PURPOSES).optional(),
    sort: z.enum(['createdAt', '-createdAt']).optional().default('-createdAt'),
  })
  .strict();

export const listWebhookEventsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    provider: z.string().trim().optional(),
    status: z.enum(WEBHOOK_PROCESSED_STATUSES).optional(),
    sort: z.enum(['createdAt', '-createdAt']).optional().default('-createdAt'),
  })
  .strict();

const isoCurrency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code');

export const createPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional().nullable(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_-]+$/, 'code must be lowercase letters, numbers, _ or -'),
    priceMinor: z.coerce.number().int().min(0).max(1_000_000_000),
    currency: isoCurrency,
    intervalCount: z.coerce.number().int().min(1).max(12).optional().default(1),
    intervalUnit: z.enum(PLAN_INTERVALS).optional().default('months'),
    includedTokens: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
    status: z.enum(PLAN_STATUSES).optional().default('active'),
    mercadoPagoPlanId: z.string().trim().optional().nullable(),
  })
  .strict();

export const updatePlanSchema = createPlanSchema.partial().strict();

export const updatePlanStatusSchema = z.object({ status: z.enum(PLAN_STATUSES) }).strict();

export const createSubscriptionSchema = z
  .object({
    planId: objectIdSchema,
    payerEmail: optionalEmail,
  })
  .strict();

export const listSubscriptionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
    sort: z.enum(['createdAt', '-createdAt']).optional().default('-createdAt'),
  })
  .strict();
