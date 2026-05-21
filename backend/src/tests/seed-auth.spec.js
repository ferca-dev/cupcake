import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { seedAuth } from '../seeders/seed-auth.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { createApp } from '../app.js';
import { loadEnv } from '../config/env.js';

let app;

beforeAll(async () => {
  await startInMemoryMongo();
  app = createApp();
});

afterAll(async () => {
  await stopInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
});

describe('seedAuth', () => {
  it('creates the super admin, demo tenant and demo client', async () => {
    const report = await seedAuth();
    expect(report.superAdmin.created).toBe(true);
    expect(report.tenant.created).toBe(true);
    expect(report.demoClient.created).toBe(true);

    expect(await User.countDocuments({ role: 'super_admin' })).toBe(1);
    expect(await Tenant.countDocuments()).toBe(1);
    expect(await User.countDocuments({ role: 'client_admin' })).toBe(1);
  });

  it('is idempotent when invoked twice', async () => {
    await seedAuth();
    const second = await seedAuth();
    expect(second.superAdmin.created).toBe(false);
    expect(second.tenant.created).toBe(false);
    expect(second.demoClient.created).toBe(false);

    expect(await User.countDocuments({ role: 'super_admin' })).toBe(1);
    expect(await Tenant.countDocuments()).toBe(1);
    expect(await User.countDocuments({ role: 'client_admin' })).toBe(1);
  });

  it('allows the seeded super admin and demo client to log in', async () => {
    const env = loadEnv();
    await seedAuth();

    const superLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD });
    expect(superLogin.status).toBe(200);
    expect(superLogin.body.data.user.role).toBe('super_admin');
    expect(superLogin.body.data.user.tenantId).toBeNull();

    const superMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${superLogin.body.data.accessToken}`);
    expect(superMe.status).toBe(200);
    expect(superMe.body.data.isSuperAdmin).toBe(true);

    const clientLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: env.DEMO_CLIENT_EMAIL, password: env.DEMO_CLIENT_PASSWORD });
    expect(clientLogin.status).toBe(200);
    expect(clientLogin.body.data.user.role).toBe('client_admin');
    expect(clientLogin.body.data.user.tenantId).toEqual(expect.any(String));
    expect(clientLogin.body.data.tenant.name).toBe(env.DEMO_TENANT_NAME);

    const clientMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${clientLogin.body.data.accessToken}`);
    expect(clientMe.status).toBe(200);
    expect(clientMe.body.data.tenant.id).toBe(clientLogin.body.data.tenant.id);
    expect(clientMe.body.data.permissions).toEqual(expect.arrayContaining(['surveys.publish']));
  });
});
