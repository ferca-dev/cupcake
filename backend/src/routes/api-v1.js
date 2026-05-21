import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { tenantsRouter } from '../modules/tenants/tenant.routes.js';
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
      endpoints: [
        '/api/v1/health',
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/logout',
        '/api/v1/auth/refresh',
        '/api/v1/auth/me',
        '/api/v1/auth/forgot-password',
        '/api/v1/auth/reset-password',
        '/api/v1/tenants/me',
        '/api/v1/tenants/:id',
      ],
    },
    message: 'API metadata',
  }),
);

apiV1Router.use('/health', healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/tenants', tenantsRouter);
