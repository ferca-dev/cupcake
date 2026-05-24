import { z } from 'zod';

import { PUBLIC_FORM_THEMES } from './branding.constants.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

const nullableUrlSchema = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .nullable()
  .optional();

const colorSchema = (label) =>
  z
    .string()
    .trim()
    .regex(/^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, `${label} must be a hex color`)
    .nullable()
    .optional();

export const updateBrandingSchema = z
  .object({
    logoUrl: nullableUrlSchema,
    logoMediaAssetId: objectIdSchema.nullable().optional(),
    faviconUrl: nullableUrlSchema,
    faviconMediaAssetId: objectIdSchema.nullable().optional(),
    primaryColor: colorSchema('Primary color'),
    accentColor: colorSchema('Accent color'),
    backgroundColor: colorSchema('Background color'),
    textColor: colorSchema('Text color'),
    publicFormTheme: z.enum(PUBLIC_FORM_THEMES).optional(),
    whiteLabel: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one branding field must be provided',
  });
