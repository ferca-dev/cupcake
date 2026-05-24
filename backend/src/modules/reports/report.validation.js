import { z } from 'zod';

import { CAMPAIGN_RECIPIENT_CHANNELS } from '../campaigns/campaign-recipient.model.js';

const REPORT_CHANNELS = Object.freeze([...CAMPAIGN_RECIPIENT_CHANNELS, 'public_link']);
const COMPLETION_STATUSES = Object.freeze(['all', 'completed', 'partial']);

const isoDate = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date format',
  });

const objectIdLike = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, 'Must be a 24-character hex string');

/**
 * Shared filter parser for survey report endpoints. Every filter is optional;
 * when omitted the endpoint runs unfiltered. `from` and `to` are interpreted
 * as inclusive ISO timestamps and applied against `metadata.submittedAt`.
 *
 * `channel` accepts a campaign channel (`email`, `sms`, `whatsapp`) or the
 * synthetic `public_link` channel, which scopes responses to those without
 * a `campaignRecipientId`.
 */
export const reportFilterSchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    channel: z.enum(REPORT_CHANNELS).optional(),
    campaignId: objectIdLike.optional(),
    surveyVersionId: objectIdLike.optional(),
    completionStatus: z.enum(COMPLETION_STATUSES).optional().default('all'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
      ctx.addIssue({
        path: ['to'],
        code: z.ZodIssueCode.custom,
        message: '`to` must be greater than or equal to `from`',
      });
    }
  });

/**
 * Export endpoint accepts the same filters plus an output type/format.
 */
export const reportExportQuerySchema = z
  .object({
    type: z.enum(['responses', 'questions']).optional().default('responses'),
    format: z.enum(['csv', 'xlsx', 'json']).optional().default('csv'),
    limit: z.coerce.number().int().min(1).max(50000).optional().default(10000),
  })
  .strict()
  .passthrough();

export const REPORT_FILTER_CHANNELS = REPORT_CHANNELS;
export const REPORT_COMPLETION_STATUSES = COMPLETION_STATUSES;
