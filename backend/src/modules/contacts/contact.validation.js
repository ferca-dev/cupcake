import { z } from 'zod';

import { CONTACT_STATUSES } from './contact.model.js';
import { CONTACT_GROUP_STATUSES } from './contact-group.model.js';
import {
  CONTACT_CONSENT_SOURCES,
  CONTACT_CONSENT_STATUSES,
  CONSENT_CHANNELS,
} from './consent.utils.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phone-like normalisation that keeps the leading + when present so future
 * provider adapters can distinguish E.164 inputs. Internal characters such as
 * spaces, hyphens, and parentheses are stripped to a digits-only suffix.
 */
export const normalisePhone = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;
  return `${hasPlus ? '+' : ''}${digits}`;
};

export const normaliseEmail = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed || null;
};

export const isValidEmail = (value) => EMAIL_PATTERN.test(String(value ?? ''));

export const isValidPhoneLike = (value) => {
  if (!value) return false;
  const digits = String(value).replace(/[^\d]/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

const nullableString = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value || null));

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(50).optional();

const groupIdsSchema = z.array(objectIdSchema).max(100).optional();

const channelConsentInputSchema = z
  .object({
    status: z.enum(CONTACT_CONSENT_STATUSES).optional(),
    source: z.enum(CONTACT_CONSENT_SOURCES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const contactConsentInputSchema = z
  .object({
    email: channelConsentInputSchema.optional(),
    sms: channelConsentInputSchema.optional(),
    whatsapp: channelConsentInputSchema.optional(),
  })
  .strict()
  .optional();

const baseContactFields = {
  firstName: nullableString(120),
  lastName: nullableString(120),
  fullName: nullableString(240),
  email: z
    .union([z.string().trim().max(200), z.null()])
    .optional()
    .transform((value) => (value === undefined ? undefined : normaliseEmail(value))),
  phone: z
    .union([z.string().trim().max(40), z.null()])
    .optional()
    .transform((value) => (value === undefined ? undefined : normalisePhone(value))),
  whatsappPhone: z
    .union([z.string().trim().max(40), z.null()])
    .optional()
    .transform((value) => (value === undefined ? undefined : normalisePhone(value))),
  tags: tagsSchema,
  groupIds: groupIdsSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  consent: contactConsentInputSchema,
  status: z.enum(CONTACT_STATUSES).optional(),
};

export const createContactSchema = z.object(baseContactFields).strict();

export const updateContactSchema = z
  .object(baseContactFields)
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const listContactsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(CONTACT_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
    email: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(40).optional(),
    whatsappPhone: z.string().trim().max(40).optional(),
    tag: z.string().trim().max(40).optional(),
    groupId: objectIdSchema.optional(),
    channel: z.enum(['email', 'phone', 'whatsapp']).optional(),
    sort: z
      .enum([
        'createdAt',
        '-createdAt',
        'updatedAt',
        '-updatedAt',
        'fullName',
        '-fullName',
        'email',
        '-email',
      ])
      .optional()
      .default('-updatedAt'),
  })
  .strict();

export const createContactGroupSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    description: nullableString(500),
    status: z.enum(CONTACT_GROUP_STATUSES).optional(),
  })
  .strict();

export const updateContactGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: nullableString(500),
    status: z.enum(CONTACT_GROUP_STATUSES).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const listContactGroupsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    status: z.enum(CONTACT_GROUP_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'name', '-name'])
      .optional()
      .default('name'),
  })
  .strict();

export const groupMembershipSchema = z
  .object({
    contactId: objectIdSchema,
  })
  .strict();

export const groupMembershipBulkSchema = z
  .object({
    contactIds: z.array(objectIdSchema).min(1).max(500),
  })
  .strict();

export const updateContactConsentSchema = z
  .object({
    channel: z.enum(CONSENT_CHANNELS),
    status: z.enum(CONTACT_CONSENT_STATUSES),
    source: z.enum(CONTACT_CONSENT_SOURCES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const contactImportPlaceholderSchema = z
  .object({
    source: z.string().trim().min(1).max(40).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .optional();
