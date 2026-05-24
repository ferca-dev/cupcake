import { z } from 'zod';

import { CUSTOM_DOMAIN_SSL_MODES, CUSTOM_DOMAIN_STATUSES } from './custom-domain.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

export const createDomainSchema = z
  .object({
    hostname: z.string().trim().min(4).max(253),
    sslMode: z.enum(CUSTOM_DOMAIN_SSL_MODES).optional().default('platform_managed'),
  })
  .strict();

export const listDomainsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(CUSTOM_DOMAIN_STATUSES).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'hostname', '-hostname', 'status', '-status'])
      .optional()
      .default('-createdAt'),
  })
  .strict();

export const updateDomainStatusSchema = z
  .object({
    status: z.enum(['active', 'inactive']),
  })
  .strict();

export const adminListDomainsQuerySchema = listDomainsQuerySchema
  .extend({
    tenantId: objectIdSchema.optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const adminVerifyDomainSchema = z
  .object({
    activate: z.boolean().optional().default(false),
  })
  .strict();

export const adminUpdateDomainStatusSchema = z
  .object({
    status: z.enum(CUSTOM_DOMAIN_STATUSES),
  })
  .strict();
