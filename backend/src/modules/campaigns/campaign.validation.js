import { z } from 'zod';

import { CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES } from './campaign.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

const targetSchema = z
  .object({
    contactIds: z.array(objectIdSchema).max(5000).optional().default([]),
    groupIds: z.array(objectIdSchema).max(200).optional().default([]),
  })
  .strict()
  .refine((data) => (data.contactIds?.length ?? 0) + (data.groupIds?.length ?? 0) > 0, {
    message: 'Provide at least one contact or group',
    path: ['contactIds'],
  });

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    surveyId: objectIdSchema,
    channels: z
      .array(z.enum(CAMPAIGN_CHANNELS))
      .min(1, 'At least one channel is required')
      .max(CAMPAIGN_CHANNELS.length),
    target: targetSchema,
    scheduledAt: z
      .union([z.string().datetime({ offset: true }), z.null()])
      .optional()
      .transform((value) => (value ? new Date(value) : null)),
  })
  .strict();

export const listCampaignsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    surveyId: objectIdSchema.optional(),
    search: z.string().trim().max(120).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'name', '-name'])
      .optional()
      .default('-createdAt'),
  })
  .strict();

export const listRecipientsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    status: z
      .enum(['pending', 'sent', 'failed', 'skipped', 'delivered', 'opened', 'clicked'])
      .optional(),
    channel: z.enum(CAMPAIGN_CHANNELS).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'status', '-status', 'channel', '-channel'])
      .optional()
      .default('createdAt'),
  })
  .strict();
