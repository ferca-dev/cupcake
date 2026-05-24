import { z } from 'zod';

import {
  SURVEY_STATUSES,
  RESPONSE_LIMIT_MODES,
  ANTI_ABUSE_SUSPICIOUS_ACTIONS,
} from './survey.model.js';
import { formSchemaSchema } from './form-schema.validator.js';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens')
  .min(2, 'Slug must be at least 2 characters')
  .max(80, 'Slug is too long');

const responseLimitSchema = z
  .object({
    mode: z.enum(RESPONSE_LIMIT_MODES).optional(),
    deviceKeyRequired: z.boolean().optional(),
    ipRequired: z.boolean().optional(),
    message: z.string().trim().max(500).optional(),
  })
  .strict();

const antiAbuseSchema = z
  .object({
    captchaRequired: z.boolean().optional(),
    honeypotEnabled: z.boolean().optional(),
    minFillSeconds: z.number().int().min(0).max(600).nullable().optional(),
    perIpPerMinute: z.number().int().min(0).max(100_000).nullable().optional(),
    perTokenPerMinute: z.number().int().min(0).max(100_000).nullable().optional(),
    suspiciousAction: z.enum(ANTI_ABUSE_SUSPICIOUS_ACTIONS).optional(),
  })
  .strict();

const locationCaptureSchema = z
  .object({
    mode: z.enum(['disabled', 'optional', 'required', 'required_for_surveyors']).optional(),
    minimumAccuracyMeters: z.number().int().min(1).max(10_000).optional(),
    allowIpFallback: z.boolean().optional(),
    storeRawIp: z.boolean().optional(),
    requiredMessage: z.string().trim().max(500).optional(),
  })
  .strict();

const settingsSchema = z
  .object({
    allowAnonymous: z.boolean().optional(),
    requireContactData: z.boolean().optional(),
    thankYouMessage: z.string().max(500).optional(),
    closeMessage: z.string().max(500).optional(),
    pausedMessage: z.string().max(500).optional(),
    oneResponsePerContact: z.boolean().optional(),
    collectIp: z.boolean().optional(),
    responseLimit: responseLimitSchema.optional(),
    antiAbuse: antiAbuseSchema.optional(),
    locationCapture: locationCaptureSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const limit = value.responseLimit;
    if (!limit) return;
    if (limit.mode === 'one_per_ip' && value.collectIp === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['responseLimit', 'mode'],
        message: 'IP-based response limits require collectIp to be enabled',
      });
    }
  });

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
    sort: z
      .enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'title', '-title'])
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
