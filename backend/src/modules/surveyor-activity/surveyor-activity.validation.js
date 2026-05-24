import { z } from 'zod';

const objectIdLike = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, 'Must be a 24-character hex string');

const isoDate = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date format',
  });

const baseFilters = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  surveyorId: objectIdLike.optional(),
  surveyId: objectIdLike.optional(),
  surveyVersionId: objectIdLike.optional(),
  campaignId: objectIdLike.optional(),
  locationStatus: z.enum(['all', 'present', 'missing', 'low_accuracy']).optional().default('all'),
  completionStatus: z.enum(['all', 'completed', 'partial']).optional().default('all'),
};

const withDateOrder = (schema) =>
  schema.superRefine((value, ctx) => {
    if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
      ctx.addIssue({
        path: ['to'],
        code: z.ZodIssueCode.custom,
        message: '`to` must be greater than or equal to `from`',
      });
    }
  });

export const activityFilterSchema = withDateOrder(z.object(baseFilters).strict());

export const activityListQuerySchema = withDateOrder(
  z
    .object({
      ...baseFilters,
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(250).optional().default(50),
    })
    .strict(),
);

export const activityMapQuerySchema = withDateOrder(
  z
    .object({
      ...baseFilters,
      limit: z.coerce.number().int().min(1).max(1000).optional().default(500),
    })
    .strict(),
);

export const activityExportQuerySchema = withDateOrder(
  z
    .object({
      ...baseFilters,
      format: z.enum(['csv', 'xlsx']).optional().default('csv'),
      limit: z.coerce.number().int().min(1).max(50000).optional().default(10000),
    })
    .strict(),
);

export const surveyorIdParamSchema = objectIdLike;
