import { z } from 'zod';

import { SURVEY_STATUSES } from './survey.model.js';
import { formSchemaSchema } from './form-schema.validator.js';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens')
  .min(2, 'Slug must be at least 2 characters')
  .max(80, 'Slug is too long');

const settingsSchema = z
  .object({
    allowAnonymous: z.boolean().optional(),
    requireContactData: z.boolean().optional(),
    thankYouMessage: z.string().max(500).optional(),
    closeMessage: z.string().max(500).optional(),
    pausedMessage: z.string().max(500).optional(),
    oneResponsePerContact: z.boolean().optional(),
    collectIp: z.boolean().optional(),
  })
  .strict();

export const createSurveySchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().max(1000).nullable().optional(),
    slug: slugSchema.optional(),
    schema: formSchemaSchema.optional(),
    settings: settingsSchema.optional(),
  })
  .strict();

export const updateSurveySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    slug: slugSchema.optional(),
    schema: formSchemaSchema.optional(),
    settings: settingsSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const listSurveysQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(SURVEY_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
    sort: z.enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'title', '-title'])
      .optional()
      .default('-updatedAt'),
  })
  .strict();

export const duplicateSurveySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    slug: slugSchema.optional(),
  })
  .strict()
  .optional();
