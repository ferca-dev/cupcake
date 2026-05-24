import { z } from 'zod';

import { submitResponseSchema } from '../public-forms/public-form.validation.js';

export const listSurveyorSurveysQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const surveyorSurveyIdSchema = z.string().trim().min(1).max(64);

export const submitSurveyorResponseSchema = submitResponseSchema.omit({
  submissionToken: true,
  deviceKey: true,
  captchaToken: true,
  honeypot: true,
});
