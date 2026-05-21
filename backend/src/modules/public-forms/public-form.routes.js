import { Router } from 'express';

import * as publicFormController from './public-form.controller.js';
import { createPublicFormRateLimiter } from '../../common/middlewares/rate-limiters.js';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();

export const publicFormsRouter = Router();

const submissionLimiter = env.isTest ? (_req, _res, next) => next() : createPublicFormRateLimiter();

publicFormsRouter.get('/forms/:slug', publicFormController.getPublicForm);

publicFormsRouter.get(
  '/forms/:slug/token/:submissionToken',
  publicFormController.getPublicFormByToken,
);

publicFormsRouter.post(
  '/forms/:slug/responses',
  submissionLimiter,
  publicFormController.submitPublicResponse,
);
