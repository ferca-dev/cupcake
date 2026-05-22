import { z } from 'zod';

import { MEDIA_PURPOSES, MEDIA_STATUSES } from './media.constants.js';

export const uploadImageFieldsSchema = z
  .object({
    purpose: z.enum(MEDIA_PURPOSES).optional().default('general'),
  })
  .strict();

export const listImagesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    purpose: z.enum(MEDIA_PURPOSES).optional(),
    status: z.enum(MEDIA_STATUSES).optional().default('active'),
    sort: z
      .enum(['createdAt', '-createdAt', 'originalName', '-originalName'])
      .default('-createdAt'),
  })
  .strict();
