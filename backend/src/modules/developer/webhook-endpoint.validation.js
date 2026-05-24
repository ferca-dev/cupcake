import { z } from 'zod';

import { WEBHOOK_EVENT_TYPE_VALUES } from './webhook-events.js';
import { WEBHOOK_ENDPOINT_STATUSES } from './webhook-endpoint.model.js';

const urlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .url('url must be a valid https:// URL');

export const createWebhookEndpointSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  url: urlSchema,
  events: z.array(z.enum(WEBHOOK_EVENT_TYPE_VALUES)).min(1).max(WEBHOOK_EVENT_TYPE_VALUES.length),
  status: z.enum(WEBHOOK_ENDPOINT_STATUSES).optional(),
});

export const updateWebhookEndpointSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  url: urlSchema.optional(),
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPE_VALUES))
    .min(1)
    .max(WEBHOOK_EVENT_TYPE_VALUES.length)
    .optional(),
  status: z.enum(WEBHOOK_ENDPOINT_STATUSES).optional(),
  rotateSecret: z.boolean().optional(),
});

export const testWebhookSchema = z
  .object({
    type: z.enum(WEBHOOK_EVENT_TYPE_VALUES).optional(),
    // `data` is intentionally permissive — the body is forwarded to the
    // receiver as-is. We accept any JSON-compatible payload.
    data: z.unknown().optional(),
  })
  .passthrough();

export const listDeliveriesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: z.string().optional(),
  })
  .partial()
  .passthrough();
