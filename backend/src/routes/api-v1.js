import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { sendSuccess } from '../common/responses/index.js';
import { loadEnv } from '../config/env.js';

const env = loadEnv();

export const apiV1Router = Router();

apiV1Router.get('/', (req, res) =>
  sendSuccess(res, {
    data: {
      name: env.APP_NAME,
      apiVersion: 'v1',
      environment: env.APP_ENV,
      endpoints: ['/api/v1/health'],
    },
    message: 'API metadata',
  }),
);

apiV1Router.use('/health', healthRouter);
