import { z } from 'zod';

import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from './transaction.model.js';

export const listTransactionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(TRANSACTION_STATUSES).optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    provider: z.string().trim().min(1).max(80).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'paidAt', '-paidAt', 'amount', '-amount'])
      .optional()
      .default('-createdAt'),
  })
  .strict();
