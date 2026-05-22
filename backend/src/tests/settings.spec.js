import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { RefreshToken } from '../modules/auth/refresh-token.model.js';
import { hashPassword, verifyPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const password = 'StrongPass123!';

const registerUser = async (overrides = {}) => {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Acme Owner',
      email: 'owner@acme.test',
      password,
      tenantName: 'Acme Co',
      ...overrides,
    });
  expect(response.status).toBe(201);
  return response.body.data;
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
});

describe('GET /api/v1/settings/profile', () => {
  it('returns the authenticated user profile', async () => {
    const session = await registerUser();
    const response = await request(app)
      .get('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.profile.email).toBe('owner@acme.test');
    expect(response.body.data.profile.preferences.locale).toBe('en');
    expect(response.body.data.profile).not.toHaveProperty('passwordHash');
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/v1/settings/profile');
    expect(response.status).toBe(401);
  });
});

describe('PUT /api/v1/settings/profile', () => {
  it('updates name and phone fields', async () => {
    const session = await registerUser();
    const response = await request(app)
      .put('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'New Name', phone: '+10000000000' });
    expect(response.status).toBe(200);
    expect(response.body.data.profile.name).toBe('New Name');
    expect(response.body.data.profile.phone).toBe('+10000000000');
  });

  it('stages email changes in pendingEmail and never mutates email directly', async () => {
    const session = await registerUser();
    const response = await request(app)
      .put('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ email: 'new@acme.test' });
    expect(response.status).toBe(200);
    expect(response.body.data.profile.email).toBe('owner@acme.test');
    expect(response.body.data.profile.pendingEmail).toBe('new@acme.test');
  });

  it('refuses to set an email that another user already owns', async () => {
    await User.create({
      tenantId: null,
      role: ROLES.SUPER_ADMIN,
      name: 'Root',
      email: 'taken@acme.test',
      passwordHash: await hashPassword(password),
      status: 'active',
    });
    const session = await registerUser();
    const response = await request(app)
      .put('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ email: 'taken@acme.test' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('ignores attempts to set role/tenantId/status (no privilege escalation)', async () => {
    const session = await registerUser();
    const otherTenant = await Tenant.create({
      name: 'Other',
      slug: 'other',
      status: 'active',
    });
    const response = await request(app)
      .put('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        name: 'Sneaky',
        role: ROLES.SUPER_ADMIN,
        tenantId: otherTenant._id.toString(),
        status: 'suspended',
      });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const stored = await User.findOne({ email: 'owner@acme.test' });
    expect(stored.role).toBe(ROLES.CLIENT_ADMIN);
    expect(stored.status).toBe('active');
  });
});

describe('PUT /api/v1/settings/password', () => {
  it('requires the current password and updates the hash', async () => {
    const session = await registerUser();
    const response = await request(app)
      .put('/api/v1/settings/password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: password, newPassword: 'EvenStronger!9' });
    expect(response.status).toBe(200);

    const stored = await User.findOne({ email: 'owner@acme.test' }).select('+passwordHash');
    expect(await verifyPassword('EvenStronger!9', stored.passwordHash)).toBe(true);
    expect(await verifyPassword(password, stored.passwordHash)).toBe(false);
  });

  it('rejects an incorrect current password', async () => {
    const session = await registerUser();
    const response = await request(app)
      .put('/api/v1/settings/password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'wrong-pass-1', newPassword: 'EvenStronger!9' });
    expect(response.status).toBe(401);
  });

  it('revokes other active refresh tokens after a password change', async () => {
    const session = await registerUser();
    const tokens = await RefreshToken.find({});
    expect(tokens).toHaveLength(1);

    const change = await request(app)
      .put('/api/v1/settings/password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: password, newPassword: 'EvenStronger!9' });
    expect(change.status).toBe(200);

    // Old refresh token must no longer be usable.
    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(refresh.status).toBe(401);

    // New credentials still work end-to-end.
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@acme.test', password: 'EvenStronger!9' });
    expect(login.status).toBe(200);
  });
});

describe('PUT /api/v1/settings/preferences', () => {
  it('persists the locale and exposes it through /auth/me', async () => {
    const session = await registerUser();
    const update = await request(app)
      .put('/api/v1/settings/preferences')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ locale: 'es' });
    expect(update.status).toBe(200);
    expect(update.body.data.profile.preferences.locale).toBe('es');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.preferences.locale).toBe('es');
  });

  it('rejects an unsupported locale', async () => {
    const session = await registerUser();
    const response = await request(app)
      .put('/api/v1/settings/preferences')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ locale: 'klingon' });
    expect(response.status).toBe(422);
  });
});
