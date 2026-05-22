import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { resetEnvCache, loadEnv } from '../config/env.js';
import { MediaAsset } from '../modules/media/media-asset.model.js';
import { LocalStorageProvider } from '../modules/media/storage/local-storage.provider.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { User } from '../modules/users/user.model.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';

let app;

const password = 'StrongPass123!';
const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

const createTenantWithAdmin = async ({ tenantName, email, role = ROLES.CLIENT_ADMIN } = {}) => {
  const tenant = await Tenant.create({
    name: tenantName,
    slug: tenantName.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
  });
  const user = await User.create({
    tenantId: tenant._id,
    role,
    name: `${tenantName} Admin`,
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  tenant.ownerUserId = user._id;
  await tenant.save();
  return { tenant, user };
};

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

beforeAll(async () => {
  await startInMemoryMongo();
  app = createApp();
});

afterAll(async () => {
  await stopInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
  await fs.rm(path.resolve(process.env.LOCAL_UPLOADS_DIR), { recursive: true, force: true });
});

describe('POST /api/v1/media/images', () => {
  it('stores image metadata and writes the file through the local provider', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${token}`)
      .field('purpose', 'survey_image')
      .attach('image', pngBuffer, {
        filename: 'pixel.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(201);
    const asset = response.body.data.asset;
    expect(asset.tenantId).toBe(tenant._id.toString());
    expect(asset.ownerUserId).toBe(user._id.toString());
    expect(asset.mimeType).toBe('image/png');
    expect(asset.dimensions).toMatchObject({ width: 1, height: 1 });
    expect(asset.storageKey).toMatch(
      new RegExp(`^tenants/${tenant._id.toString()}/surveys/\\d{4}/\\d{2}/`),
    );
    expect(asset.publicUrl).toContain('/uploads/tenants/');

    const stored = await MediaAsset.findById(asset.id);
    expect(stored).toBeTruthy();
    expect(stored.storageKey).toBe(asset.storageKey);

    const localPath = path.resolve(process.env.LOCAL_UPLOADS_DIR, asset.storageKey);
    await expect(fs.stat(localPath)).resolves.toMatchObject({ size: pngBuffer.length });
  });

  it('rejects invalid files and oversized uploads', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const invalid = await request(app)
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('not an image'), {
        filename: 'not-image.txt',
        contentType: 'text/plain',
      });

    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const oversized = await request(app)
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.alloc(6 * 1024 * 1024), {
        filename: 'large.png',
        contentType: 'image/png',
      });

    expect(oversized.status).toBe(422);
    expect(oversized.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication and tenant context', async () => {
    const response = await request(app).post('/api/v1/media/images').attach('image', pngBuffer, {
      filename: 'pixel.png',
      contentType: 'image/png',
    });

    expect(response.status).toBe(401);
  });
});

describe('Media tenant isolation', () => {
  it('does not expose image records across tenants', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });

    const acmeToken = await login('acme@test.local');
    const betaToken = await login('beta@test.local');

    const upload = await request(app)
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${betaToken}`)
      .field('purpose', 'tenant_branding')
      .attach('image', pngBuffer, {
        filename: 'logo.png',
        contentType: 'image/png',
      });
    expect(upload.status).toBe(201);

    const crossTenant = await request(app)
      .get(`/api/v1/media/images/${upload.body.data.asset.id}`)
      .set('Authorization', `Bearer ${acmeToken}`);

    expect(crossTenant.status).toBe(404);

    const own = await request(app)
      .get('/api/v1/media/images')
      .set('Authorization', `Bearer ${betaToken}`)
      .query({ purpose: 'tenant_branding' });

    expect(own.status).toBe(200);
    expect(own.body.data.items).toHaveLength(1);
    expect(own.body.data.items[0].tenantId).toBe(beta.tenant._id.toString());
  });

  it('marks assets as deleted without physically purging immediately', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const upload = await request(app)
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', pngBuffer, {
        filename: 'pixel.png',
        contentType: 'image/png',
      });
    const asset = upload.body.data.asset;

    const deleted = await request(app)
      .delete(`/api/v1/media/images/${asset.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(200);
    const doc = await MediaAsset.findById(asset.id);
    expect(doc.status).toBe('deleted');
    const storedFile = await fs.stat(path.resolve(process.env.LOCAL_UPLOADS_DIR, asset.storageKey));
    expect(storedFile.isFile()).toBe(true);
  });
});

describe('LocalStorageProvider', () => {
  it('writes, resolves, and deletes local objects by generated key', async () => {
    const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cupcake-media-'));
    const provider = new LocalStorageProvider({
      uploadsDir,
      publicBaseUrl: 'http://localhost:4000/uploads',
    });

    const key = 'tenants/tenant-1/general/test.png';
    const stored = await provider.uploadImage({
      key,
      buffer: pngBuffer,
      contentType: 'image/png',
    });

    expect(stored.publicUrl).toBe(
      'http://localhost:4000/uploads/tenants/tenant-1/general/test.png',
    );
    await expect(fs.stat(path.join(uploadsDir, key))).resolves.toMatchObject({
      size: pngBuffer.length,
    });

    const url = await provider.getImageUrl({ key });
    expect(url).toMatchObject({ url: stored.publicUrl, isPublic: true, expiresAt: null });

    await provider.deleteImage({ key });
    await expect(fs.stat(path.join(uploadsDir, key))).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });
});

describe('storage environment validation', () => {
  it('rejects local storage in production and incomplete S3 configuration', () => {
    const backup = { ...process.env };
    try {
      process.env.APP_ENV = 'production';
      process.env.STORAGE_DRIVER = 'local';
      resetEnvCache();
      expect(() => loadEnv()).toThrow(/Production storage/);

      process.env.APP_ENV = 'staging';
      process.env.STORAGE_DRIVER = 's3';
      process.env.S3_REGION = '';
      process.env.S3_BUCKET = '';
      process.env.S3_ACCESS_KEY_ID = '';
      process.env.S3_SECRET_ACCESS_KEY = '';
      resetEnvCache();
      expect(() => loadEnv()).toThrow(/S3_REGION/);
    } finally {
      process.env = backup;
      resetEnvCache();
    }
  });
});
