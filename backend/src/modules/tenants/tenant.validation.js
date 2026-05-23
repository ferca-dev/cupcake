import { z } from 'zod';

import { TENANT_STATUS_VALUES } from './tenant.model.js';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens')
  .min(2)
  .max(80);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const brandingSchema = z
  .object({
    logoUrl: z.string().url().nullable().optional(),
    primaryColor: z
      .string()
      .regex(/^#?[0-9a-fA-F]{3,8}$/, 'Primary color must be a hex value')
      .nullable()
      .optional(),
  })
  .strict()
  .partial()
  .optional();

const settingsSchema = z
  .object({
    timezone: z.string().trim().min(1).max(80).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    branding: brandingSchema,
    maxTeamMembers: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
  })
  .strict()
  .partial()
  .optional();

const adminUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: passwordSchema,
    phone: z.string().trim().min(3).max(40).nullable().optional(),
    whatsappPhone: z.string().trim().min(3).max(40).nullable().optional(),
  })
  .strict();

export const listTenantsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(TENANT_STATUS_VALUES).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'name', '-name', 'status', '-status'])
      .optional()
      .default('-createdAt'),
  })
  .strict();

export const createTenantSchema = z
  .object({
    name: z.string().trim().min(2, 'Tenant name is required').max(120),
    slug: slugSchema.optional(),
    status: z.enum(TENANT_STATUS_VALUES).optional().default('active'),
    planId: z.string().trim().min(1).nullable().optional(),
    settings: settingsSchema,
    // Optional bootstrap admin. When provided the API creates a client_admin
    // user inside the new tenant and stamps it as `ownerUserId`.
    admin: adminUserSchema.optional(),
  })
  .strict();

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: slugSchema.optional(),
    planId: z.string().trim().min(1).nullable().optional(),
    settings: settingsSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const updateTenantStatusSchema = z
  .object({
    status: z.enum(TENANT_STATUS_VALUES),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
