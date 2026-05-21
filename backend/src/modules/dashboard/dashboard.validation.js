import { z } from 'zod';

const isoDate = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date format',
  });

export const dashboardRangeSchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict();

export const recentActivityQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export const adminMetricsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  })
  .strict();
