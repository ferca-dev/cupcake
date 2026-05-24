import { z } from 'zod';

import { API_SCOPE_VALUES } from './api-scopes.js';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  scopes: z.array(z.enum(API_SCOPE_VALUES)).min(1).max(API_SCOPE_VALUES.length),
  expiresAt: z
    .union([z.string().datetime(), z.string().min(0)])
    .optional()
    .nullable(),
});
