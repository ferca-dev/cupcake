import { z } from 'zod';

import { TEMPLATE_STATUSES, TEMPLATE_CATEGORIES } from './template.model.js';
import { formSchemaSchema } from '../surveys/form-schema.validator.js';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens')
  .min(2)
  .max(80);

export const createTemplateSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().max(1000).optional().default(''),
    category: z.enum(TEMPLATE_CATEGORIES).optional().default('other'),
    schema: formSchemaSchema,
    status: z.enum(TEMPLATE_STATUSES).optional().default('active'),
    // Only super admins may set this flag; the service enforces the rule.
    isSystemTemplate: z.boolean().optional(),
  })
  .strict();

export const updateTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    category: z.enum(TEMPLATE_CATEGORIES).optional(),
    schema: formSchemaSchema.optional(),
    status: z.enum(TEMPLATE_STATUSES).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const listTemplatesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    status: z.enum(TEMPLATE_STATUSES).optional(),
    category: z.enum(TEMPLATE_CATEGORIES).optional(),
    search: z.string().trim().max(120).optional(),
    scope: z.enum(['all', 'system', 'tenant']).optional().default('all'),
  })
  .strict();

export const createSurveyFromTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .optional();
