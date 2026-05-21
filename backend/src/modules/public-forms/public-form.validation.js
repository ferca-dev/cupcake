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
    answers: z.array(answerSchema).max(500).default([]),
    metadata: z
      .object({
        startedAt: z
          .string()
          .datetime({ offset: true })
          .optional(),
        completionTimeSeconds: z.number().int().min(0).max(86_400).optional(),
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
