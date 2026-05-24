import { z } from 'zod';

/**
 * Accepts a wide range of answer values (string, number, boolean, array,
 * object). The detailed shape is enforced per-field by the answer validator
 * against the immutable published schema, so this layer only protects against
 * obviously-malformed payloads.
 */
const answerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
  z.record(z.unknown()),
  z.null(),
]);

const answerSchema = z
  .object({
    fieldId: z.string().trim().min(1).max(80),
    key: z.string().trim().max(80).optional(),
    type: z.string().trim().max(40).optional(),
    value: answerValueSchema.optional(),
  })
  .strict();

export const submitResponseSchema = z
  .object({
    submissionToken: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    // Anonymous device identifier generated in the public form. The format
    // intentionally allows base64url-style values so different client
    // implementations (web, mobile) can plug in without a server change.
    deviceKey: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/, 'Device key is malformed')
      .optional(),
    answers: z.array(answerSchema).max(500).default([]),
    // Cloudflare Turnstile (or future provider) verification token. The
    // anti-abuse service decides whether a token is required for the target
    // survey; here we only enforce shape so a malformed token is rejected
    // before the provider call.
    captchaToken: z.string().trim().min(1).max(4096).optional(),
    // Honeypot inputs are recorded under a permissive map so any future
    // honeypot field name (configurable via env) deserializes without a
    // schema change. Real browsers leave the value blank; bots fill it.
    honeypot: z.record(z.string()).optional(),
    metadata: z
      .object({
        startedAt: z.string().datetime({ offset: true }).optional(),
        completionTimeSeconds: z.number().int().min(0).max(86_400).optional(),
        location: z
          .object({
            latitude: z.number().min(-90).max(90).nullable().optional(),
            longitude: z.number().min(-180).max(180).nullable().optional(),
            accuracyMeters: z.number().min(0).nullable().optional(),
            permissionStatus: z
              .enum(['granted', 'denied', 'prompt', 'unavailable'])
              .nullable()
              .optional(),
            source: z.enum(['browser', 'ip', 'surveyor_required']).nullable().optional(),
            capturedAt: z.string().datetime({ offset: true }).nullable().optional(),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict()
      .optional()
      .default({}),
  })
  .strict();

export const submissionTokenParamSchema = z
  .string()
  .trim()
  .min(8, 'Submission token is too short')
  .max(128, 'Submission token is too long')
  .regex(/^[A-Za-z0-9_-]+$/, 'Submission token is malformed');

export const publicSlugParamSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens')
  .min(2)
  .max(80);
