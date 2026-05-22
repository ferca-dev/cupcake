import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
} from '../common/errors/index.js';
import { errorHandler, notFoundHandler } from '../common/middlewares/index.js';
import { ERROR_CODES } from '../common/constants/error-codes.js';
import { createApp } from '../app.js';

const buildHarness = (route) => {
  const app = express();
  app.use(express.json());
  app.get('/test', route);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe('global error handler', () => {
  it('returns the shared envelope when a ValidationError is thrown', async () => {
    const app = buildHarness((_req, _res, next) => {
      next(new ValidationError('Invalid payload', [{ path: ['email'], message: 'Required' }]));
    });

    const response = await request(app).get('/test');

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(response.body.error.message).toBe('Invalid payload');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['email'] })]),
    );
  });

  it('maps AuthenticationError to 401', async () => {
    const app = buildHarness((_req, _res, next) => next(new AuthenticationError()));
    const response = await request(app).get('/test');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_ERROR);
  });

  it('maps AuthorizationError to 403', async () => {
    const app = buildHarness((_req, _res, next) => next(new AuthorizationError()));
    const response = await request(app).get('/test');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.AUTHORIZATION_ERROR);
  });

  it('maps NotFoundError to 404', async () => {
    const app = buildHarness((_req, _res, next) => next(new NotFoundError('Survey not found')));
    const response = await request(app).get('/test');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(response.body.error.message).toBe('Survey not found');
  });

  it('maps ConflictError to 409', async () => {
    const app = buildHarness((_req, _res, next) => next(new ConflictError()));
    const response = await request(app).get('/test');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODES.CONFLICT);
  });

  it('translates a thrown ZodError into a 422 validation envelope', async () => {
    const schema = z.object({ email: z.string().email() });
    const app = buildHarness((_req, _res, next) => {
      try {
        schema.parse({ email: 'not-an-email' });
      } catch (err) {
        next(err);
      }
    });

    const response = await request(app).get('/test');
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it('returns 500 for unknown errors without exposing the stack in production', async () => {
    const previous = {
      APP_ENV: process.env.APP_ENV,
      STORAGE_DRIVER: process.env.STORAGE_DRIVER,
      S3_REGION: process.env.S3_REGION,
      S3_BUCKET: process.env.S3_BUCKET,
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    };
    const { resetEnvCache } = await import('../config/env.js');
    try {
      process.env.APP_ENV = 'production';
      process.env.STORAGE_DRIVER = 's3';
      process.env.S3_REGION = 'us-east-1';
      process.env.S3_BUCKET = 'cupcake-test';
      process.env.S3_ACCESS_KEY_ID = 'test-key';
      process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
      resetEnvCache();

      const app = buildHarness((_req, _res, next) => next(new Error('boom — internal detail')));

      const response = await request(app).get('/test');
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(response.body.error.message).toBe('An unexpected error occurred');
      expect(JSON.stringify(response.body)).not.toContain('boom');
      expect(JSON.stringify(response.body)).not.toMatch(/at\s.+:\d+:\d+/);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      resetEnvCache();
    }
  });

  it('includes a stack trace in non-production environments for easier debugging', async () => {
    const app = buildHarness((_req, _res, next) => next(new Error('debug stack')));
    const response = await request(app).get('/test');
    expect(response.status).toBe(500);
    expect(response.body.error.details.some((entry) => entry?.stack)).toBe(true);
  });

  it('still respects custom AppError subclasses with details', async () => {
    class TeapotError extends AppError {
      constructor() {
        super("I'm a teapot", { statusCode: 418, code: 'TEAPOT', details: [{ tea: 'earl grey' }] });
      }
    }
    const app = buildHarness((_req, _res, next) => next(new TeapotError()));
    const response = await request(app).get('/test');
    expect(response.status).toBe(418);
    expect(response.body.error.code).toBe('TEAPOT');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ tea: 'earl grey' })]),
    );
  });
});

describe('unknown route handling', () => {
  const app = createApp();

  it('returns a 404 envelope for unmatched routes', async () => {
    const response = await request(app).get('/api/v1/this-route-does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: expect.stringContaining('was not found'),
      },
    });
  });
});
