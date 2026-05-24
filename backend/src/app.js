import express from 'express';
import compression from 'compression';
import path from 'node:path';

import { loadEnv } from './config/env.js';
import { createHelmetMiddleware, createCorsMiddleware } from './config/security.js';
import { apiV1Router } from './routes/api-v1.js';
import { API_PREFIX } from './common/constants/index.js';
import {
  requestLogger,
  notFoundHandler,
  errorHandler,
  sanitizeInput,
  createGlobalRateLimiter,
} from './common/middlewares/index.js';
import { registerAllProcessors } from './modules/jobs/processors/index.js';

/**
 * Creates and configures the Express application. The factory pattern keeps
 * app construction free of process-level concerns (signals, ports) so tests
 * can mount it without booting a server.
 */
export const createApp = () => {
  const env = loadEnv();

  // Make sure every job type is wired before the HTTP layer goes online.
  // In the test suite (which uses the inline driver) this is also what
  // makes enqueue-from-controller cycles complete synchronously inside a
  // request.
  registerAllProcessors();

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLogger);
  app.use(createHelmetMiddleware());
  app.use(createCorsMiddleware());
  app.use(compression());

  if (env.STORAGE_DRIVER === 'local') {
    const uploadsPath = new URL(env.STORAGE_PUBLIC_BASE_URL).pathname || '/uploads';
    app.use(
      uploadsPath,
      express.static(path.resolve(env.LOCAL_UPLOADS_DIR), {
        immutable: true,
        maxAge: env.isProduction ? '1y' : 0,
      }),
    );
  }

  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.REQUEST_BODY_LIMIT }));

  app.use(sanitizeInput);

  if (!env.isTest) {
    app.use(API_PREFIX, createGlobalRateLimiter());
  }

  app.use(API_PREFIX, apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
