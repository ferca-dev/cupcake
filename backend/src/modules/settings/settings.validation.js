import { z } from 'zod';

import { SUPPORTED_LOCALES } from './supported-locales.js';

const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^\+?[0-9 ()\-.]{6,40}$/u, 'Phone format is invalid')
  .nullable()
  .optional();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    email: z.string().trim().toLowerCase().email('Email must be a valid email address').optional(),
    phone: phoneSchema,
    whatsappPhone: phoneSchema,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const updatePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Current password is required' })
      .min(1, 'Current password is required'),
    newPassword: z
      .string({ required_error: 'New password is required' })
      .min(8, 'New password must be at least 8 characters')
      .max(200),
  })
  .strict()
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

export const updatePreferencesSchema = z
  .object({
    locale: z.enum(SUPPORTED_LOCALES).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one preference must be provided',
  });
