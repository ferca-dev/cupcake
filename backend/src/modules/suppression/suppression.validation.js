import { z } from 'zod';

import {
  SUPPRESSION_CHANNELS,
  SUPPRESSION_REASONS,
  SUPPRESSION_SOURCES,
  SUPPRESSION_STATUSES,
} from './suppression-list.model.js';
import {
  isValidEmail,
  isValidPhoneLike,
  normaliseEmail,
  normalisePhone,
} from '../contacts/contact.validation.js';

const nullableString = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value || null));

export const normalizeSuppressionAddress = ({ channel, value, email, phone, whatsappPhone }) => {
  if (channel === 'email') return normaliseEmail(email ?? value ?? null);
  if (channel === 'sms') return normalisePhone(phone ?? value ?? null);
  if (channel === 'whatsapp') return normalisePhone(whatsappPhone ?? value ?? phone ?? null);
  return null;
};

export const validateSuppressionAddress = ({ channel, address }) => {
  if (channel === 'email') return isValidEmail(address);
  if (channel === 'sms' || channel === 'whatsapp') return isValidPhoneLike(address);
  return false;
};

export const createSuppressionSchema = z
  .object({
    channel: z.enum(SUPPRESSION_CHANNELS),
    value: nullableString(200),
    email: nullableString(200),
    phone: nullableString(40),
    whatsappPhone: nullableString(40),
    reason: z.enum(SUPPRESSION_REASONS).optional().default('manual'),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const listSuppressionQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    channel: z.enum(SUPPRESSION_CHANNELS).optional(),
    status: z.enum(SUPPRESSION_STATUSES).optional(),
    reason: z.enum(SUPPRESSION_REASONS).optional(),
    source: z.enum(SUPPRESSION_SOURCES).optional(),
    search: z.string().trim().max(120).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'value', '-value'])
      .optional()
      .default('-createdAt'),
  })
  .strict();

export const publicEmailUnsubscribeTokenSchema = z
  .object({
    token: z.string().trim().min(20).max(2000),
  })
  .strict();

export const twilioOptOutSchema = z
  .object({
    From: z.string().trim().optional(),
    To: z.string().trim().optional(),
    Body: z.string().trim().optional(),
    MessageSid: z.string().trim().optional(),
    SmsSid: z.string().trim().optional(),
    tenantId: z.string().trim().optional(),
    TenantId: z.string().trim().optional(),
    channel: z.string().trim().optional(),
    Channel: z.string().trim().optional(),
  })
  .passthrough();
