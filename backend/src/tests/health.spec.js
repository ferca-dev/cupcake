import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('GET /api/v1/health', () => {
  const app = createApp();

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
