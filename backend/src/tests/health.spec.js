import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('allows preflight requests from the configured frontend origin', async () => {
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('returns a success envelope with app metadata', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: expect.any(String),
    });
    expect(response.body.data).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      app: {
        name: expect.any(String),
        env: 'test',
      },
      dependencies: {
        database: expect.any(String),
      },
      timestamp: expect.any(String),
      uptimeSeconds: expect.any(Number),
    });
  });

  it('reports degraded status when the database is not connected', async () => {
    const response = await request(app).get('/api/v1/health');
    // The setup file does not connect Mongoose, so the connection state is
    // expected to be `disconnected` and overall status `degraded`.
    expect(response.body.data.dependencies.database).toBe('disconnected');
    expect(response.body.data.status).toBe('degraded');
  });
});

describe('production readiness health endpoints', () => {
  const app = createApp();

  it('returns liveness without checking dependencies', async () => {
    const response = await request(app).get('/api/v1/health/live');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('returns 503 from readiness when critical dependencies are unavailable', async () => {
    const response = await request(app).get('/api/v1/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body.error.details[0].status).toBe('not_ready');
  });

  it('echoes request and correlation ids on every response', async () => {
    const response = await request(app)
      .get('/api/v1/health/live')
      .set('x-request-id', 'req-health-test')
      .set('x-correlation-id', 'corr-health-test');

    expect(response.headers['x-request-id']).toBe('req-health-test');
    expect(response.headers['x-correlation-id']).toBe('corr-health-test');
  });
});

describe('GET /api/v1', () => {
  const app = createApp();

  it('returns API metadata', async () => {
    const response = await request(app).get('/api/v1');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      apiVersion: 'v1',
      endpoints: expect.arrayContaining([
        '/api/v1/health',
        '/api/v1/auth/login',
        '/api/v1/auth/me',
        '/api/v1/tenants/me',
      ]),
    });
  });
});
