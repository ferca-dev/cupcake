import { z } from 'zod';

import { CHANNEL_PRICING_CHANNELS } from './channel-pricing.model.js';
import { TOKEN_PACKAGE_STATUSES } from './token-package.model.js';
import { TOKEN_PURCHASE_STATUSES } from './token-purchase.model.js';
import { TOKEN_LEDGER_TYPES, TOKEN_LEDGER_CHANNELS } from './token-ledger-entry.model.js';
import { SEND_LIMIT_ENFORCEMENTS } from './tenant-send-limit.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code');

export const listPackagesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    status: z.enum(TOKEN_PACKAGE_STATUSES).optional(),
    sort: z
      .enum(['sortOrder', '-sortOrder', 'createdAt', '-createdAt', 'priceMinor', '-priceMinor'])
      .optional()
      .default('sortOrder'),
  })
  .strict();

export const createPackageSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional().nullable(),
    tokens: z.coerce.number().int().min(1).max(10_000_000),
    priceMinor: z.coerce.number().int().min(0).max(1_000_000_000),
    currency: currencySchema,
    sortOrder: z.coerce.number().int().optional().default(0),
    status: z.enum(TOKEN_PACKAGE_STATUSES).optional().default('active'),
  })
  .strict();

export const updatePackageSchema = createPackageSchema.partial().strict();

export const updatePackageStatusSchema = z
  .object({
    status: z.enum(TOKEN_PACKAGE_STATUSES),
  })
  .strict();

export const updateChannelPricingSchema = z
  .object({
    channel: z.enum(CHANNEL_PRICING_CHANNELS),
    tokensPerRecipient: z.coerce.number().int().min(1).max(1_000_000),
  })
  .strict();

const nullableInt = z.coerce.number().int().min(0).nullable();

export const updateSendLimitsSchema = z
  .object({
    monthlyTotal: nullableInt.optional().default(null),
    monthlyPerChannel: z
      .object({
        email: nullableInt.optional().default(null),
        sms: nullableInt.optional().default(null),
        whatsapp: nullableInt.optional().default(null),
      })
      .strict()
      .optional()
      .default({ email: null, sms: null, whatsapp: null }),
    enforcement: z.enum(SEND_LIMIT_ENFORCEMENTS).optional().default('hard'),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const adjustmentSchema = z
  .object({
    direction: z.enum(['credit', 'debit']),
    amount: z.coerce.number().int().min(1).max(10_000_000),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const listLedgerQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    type: z.enum(TOKEN_LEDGER_TYPES).optional(),
    channel: z.enum(TOKEN_LEDGER_CHANNELS).optional(),
    sort: z.enum(['createdAt', '-createdAt']).optional().default('-createdAt'),
  })
  .strict();

export const listPurchasesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(TOKEN_PURCHASE_STATUSES).optional(),
    sort: z.enum(['createdAt', '-createdAt']).optional().default('-createdAt'),
  })
  .strict();

export const requestPurchaseSchema = z
  .object({
    packageId: objectIdSchema,
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const purchaseDecisionSchema = z
  .object({
    decisionNotes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();
