import { z } from 'zod';

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Email must be a valid email address');

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters');

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    email: emailSchema,
    password: passwordSchema,
    tenantName: z.string().trim().min(1, 'Tenant name is required').max(120),
    tenantSlug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens')
      .min(2)
      .max(60)
      .optional(),
    phone: z.string().trim().max(40).optional().nullable(),
    whatsappPhone: z.string().trim().max(40).optional().nullable(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token is required').optional(),
  })
  .strict()
  .optional();

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .strict()
  .optional();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'Reset token is required'),
    password: passwordSchema,
  })
  .strict();
