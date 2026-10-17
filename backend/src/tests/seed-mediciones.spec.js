import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { seedAuth } from '../seeders/seed-auth.js';
import { seedPlans } from '../seeders/seed-plans.js';
import { assertLocalMedicionesSeed, seedMediciones } from '../seeders/seed-mediciones.js';
import { loadEnv, resetEnvCache } from '../config/env.js';
import { createApp } from '../app.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { MediaAsset } from '../modules/media/media-asset.model.js';
import { PlanAssignment } from '../modules/plans/plan-assignment.model.js';
import { hashPassword, verifyPassword } from '../common/auth/passwords.js';

let app;
let uploadsDir;
const previousUploads = process.env.LOCAL_UPLOADS_DIR;
const previousPassword = process.env.MEDICIONES_CLIENT_PASSWORD;

beforeAll(async () => {
  uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediciones-seed-'));
  process.env.LOCAL_UPLOADS_DIR = uploadsDir;
  process.env.MEDICIONES_CLIENT_PASSWORD = 'LocalSeed123!';
  resetEnvCache();
  await startInMemoryMongo();
  app = createApp();
});

afterAll(async () => {
  await stopInMemoryMongo();
  await fs.rm(uploadsDir, { recursive: true, force: true });
  if (previousUploads === undefined) delete process.env.LOCAL_UPLOADS_DIR;
  else process.env.LOCAL_UPLOADS_DIR = previousUploads;
  if (previousPassword === undefined) delete process.env.MEDICIONES_CLIENT_PASSWORD;
  else process.env.MEDICIONES_CLIENT_PASSWORD = previousPassword;
  resetEnvCache();
});

beforeEach(async () => {
  await clearCollections();
  await seedAuth();
  await seedPlans();
});

describe('local MEDICIONES MX seeder', () => {
  it('creates an isolated client with usable branding, without changing the platform admin', async () => {
    const env = loadEnv();
    const adminBefore = await User.findOne({ email: env.SUPER_ADMIN_EMAIL })
      .select('+passwordHash')
      .lean();
    const report = await seedMediciones();
    expect(report.tenant.created).toBe(true);
    expect(report.user.created).toBe(true);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: env.MEDICIONES_CLIENT_EMAIL,
      password: env.MEDICIONES_CLIENT_PASSWORD,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({ name: 'MEDICIONES MX', role: 'client_admin' });
    expect(login.body.data.tenant).toMatchObject({
      name: 'MEDICIONES MX',
      slug: 'mediciones-mx',
      ownerUserId: report.user.id,
    });
    const branding = await request(app)
      .get('/api/v1/branding')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(branding.status).toBe(200);
    expect(branding.body.data.capabilities.customBranding).toBe(true);
    expect(branding.body.data.branding.primaryColor).toBe('#025c7c');
    const logo = await request(app).get(new URL(branding.body.data.branding.logoUrl).pathname);
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.body).toEqual(
      await fs.readFile(new URL('../seeders/assets/mediciones-mx.png', import.meta.url)),
    );
    const adminAfter = await User.findById(adminBefore._id).select('+passwordHash').lean();
    expect(adminAfter).toEqual(adminBefore);
  });

  it('does not duplicate users, logos or plans and preserves later password and branding edits', async () => {
    const first = await seedMediciones();
    await User.updateOne(
      { _id: first.user.id },
      { $set: { passwordHash: await hashPassword('UpdatedPassword123!') } },
    );
    await Tenant.updateOne(
      { _id: first.tenant.id },
      { $set: { 'settings.branding.primaryColor': '#123456' } },
    );
    const second = await seedMediciones();
    expect(second.tenant).toEqual({ id: first.tenant.id, created: false });
    expect(second.user.created).toBe(false);
    expect(await Tenant.countDocuments()).toBe(2);
    expect(await User.countDocuments()).toBe(3);
    expect(await MediaAsset.countDocuments({ tenantId: first.tenant.id })).toBe(1);
    expect(await PlanAssignment.countDocuments({ tenantId: first.tenant.id })).toBe(1);
    const user = await User.findById(first.user.id).select('+passwordHash');
    expect(await verifyPassword('UpdatedPassword123!', user.passwordHash)).toBe(true);
    expect((await Tenant.findById(first.tenant.id)).settings.branding.primaryColor).toBe('#123456');
  });

  it('rejects an email that belongs to another tenant before creating data', async () => {
    await User.updateOne(
      { email: loadEnv().DEMO_CLIENT_EMAIL },
      { $set: { email: loadEnv().MEDICIONES_CLIENT_EMAIL } },
    );
    await expect(seedMediciones()).rejects.toThrow('already belongs to another account');
    expect(await Tenant.countDocuments()).toBe(1);
    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it('rejects remote databases, remote storage and non-development environments', () => {
    const env = loadEnv();
    expect(() => assertLocalMedicionesSeed(env)).not.toThrow();
    for (const overrides of [
      { APP_ENV: 'production' },
      { APP_ENV: 'staging' },
      { MONGODB_URI: 'mongodb+srv://remote.example.com/cupcake' },
      { MONGODB_URI: 'mongodb://remote.example.com/cupcake' },
      { STORAGE_DRIVER: 's3' },
      { STORAGE_PUBLIC_BASE_URL: 'https://remote.example.com/uploads' },
    ]) {
      expect(() => assertLocalMedicionesSeed({ ...env, ...overrides })).toThrow(
        'only be seeded into a local',
      );
    }
  });
});
