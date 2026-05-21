import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { RefreshToken } from '../modules/auth/refresh-token.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const validRegister = (overrides = {}) => ({
  name: 'Acme Owner',
  email: 'owner@acme.test',
  password: 'StrongPass123!',
  tenantName: 'Acme Co',
  ...overrides,
});

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

const registerUser = async (overrides) => {
  const payload = validRegister(overrides);
  const response = await request(app).post('/api/v1/auth/register').send(payload);
  return { payload, response };
};

const createTenantWithAdmin = async ({ tenantName, email, password = 'StrongPass123!' }) => {
  const tenant = await Tenant.create({
    name: tenantName,
    slug: tenantName.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
  });
  const user = await User.create({
    tenantId: tenant._id,
    role: ROLES.CLIENT_ADMIN,
    name: `${tenantName} Admin`,
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  tenant.ownerUserId = user._id;
  await tenant.save();
  return { tenant, user, password };
};

const loginAs = async (email, password) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data;
};

describe('POST /api/v1/auth/register', () => {
  it('creates a client_admin user, a tenant, and returns tokens', async () => {
    const { response } = await registerUser();
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe('client_admin');
    expect(response.body.data.user.email).toBe('owner@acme.test');
    expect(response.body.data.tenant.name).toBe('Acme Co');
    expect(response.body.data.tenant.id).toBe(response.body.data.user.tenantId);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body.data.permissions).toEqual(expect.arrayContaining(['surveys.create']));
  });

  it('rejects duplicate email with 409', async () => {
    await registerUser();
    const { response } = await registerUser();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects invalid payloads with a validation error', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({ email: 'nope' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('persists a refresh token associated with the new user', async () => {
    const { response } = await registerUser();
    const tokens = await RefreshToken.find({ userId: response.body.data.user.id });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].revokedAt).toBeNull();
    // The plaintext refresh token must never be stored.
    expect(tokens[0].tokenHash).not.toBe(response.body.data.refreshToken);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    await registerUser();
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@acme.test', password: 'StrongPass123!' });
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe('owner@acme.test');
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('rejects wrong password with 401', async () => {
    await registerUser();
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@acme.test', password: 'WrongPass!1' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('does not reveal whether the email exists', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@acme.test', password: 'Whatever1!' });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/invalid email or password/i);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const { response } = await registerUser();
    const oldRefresh = response.body.data.refreshToken;

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh });

    expect(refresh.status).toBe(200);
    expect(refresh.body.data.accessToken).toEqual(expect.any(String));
    expect(refresh.body.data.refreshToken).not.toBe(oldRefresh);

    // Using the old token again must fail (and revoke remaining sessions).
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(reuse.status).toBe(401);
  });

  it('rejects refresh without a token', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({});
    expect(response.status).toBe(401);
  });

  it('revokes every active refresh token for the user when a reuse is detected', async () => {
    // Reuse detection is the breach-recovery path. Hitting the endpoint twice
    // with the same revoked token must invalidate the legitimate new session
    // too, so a stolen refresh secret cannot quietly outlive the rotation.
    const { response } = await registerUser();
    const originalRefresh = response.body.data.refreshToken;

    const rotation = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefresh });
    expect(rotation.status).toBe(200);
    const newRefresh = rotation.body.data.refreshToken;

    // Reuse of the original (now revoked) token must trigger the
    // defensive revocation of every still-active token for the same user.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefresh });
    expect(reuse.status).toBe(401);

    const stillValid = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: newRefresh });
    expect(stillValid.status).toBe(401);

    const remaining = await RefreshToken.find({ revokedAt: null });
    expect(remaining).toHaveLength(0);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the supplied refresh token', async () => {
    const { response } = await registerUser();
    const refreshToken = response.body.data.refreshToken;

    const logout = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(logout.status).toBe(200);
    expect(logout.body.data.revoked).toBe(true);

    const refreshAttempt = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refreshAttempt.status).toBe(401);
  });

  it('is safe to call without a token', async () => {
    const logout = await request(app).post('/api/v1/auth/logout').send({});
    expect(logout.status).toBe(200);
    expect(logout.body.data.revoked).toBe(false);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns user, tenant, and permissions for an authenticated request', async () => {
    const { response } = await registerUser();
    const accessToken = response.body.data.accessToken;

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('owner@acme.test');
    expect(me.body.data.tenant.name).toBe('Acme Co');
    expect(me.body.data.permissions).toEqual(expect.arrayContaining(['surveys.create']));
    expect(me.body.data.isSuperAdmin).toBe(false);
  });

  it('rejects requests without a bearer token', async () => {
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects malformed authorization headers', async () => {
    const response = await request(app).get('/api/v1/auth/me').set('Authorization', 'Token nope');
    expect(response.status).toBe(401);
  });
});

describe('Tenant isolation', () => {
  it('prevents a client from accessing another tenant by id', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });

    const session = await loginAs(acme.user.email, acme.password);
    const accessToken = session.accessToken;

    const ownTenant = await request(app)
      .get(`/api/v1/tenants/${acme.tenant._id.toString()}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ownTenant.status).toBe(200);
    expect(ownTenant.body.data.tenant.name).toBe('Acme');

    const otherTenant = await request(app)
      .get(`/api/v1/tenants/${beta.tenant._id.toString()}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(otherTenant.status).toBe(403);
    expect(otherTenant.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('allows a super admin to read any tenant', async () => {
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });

    const superAdmin = await User.create({
      tenantId: null,
      role: ROLES.SUPER_ADMIN,
      name: 'Root',
      email: 'root@cupcake.test',
      passwordHash: await hashPassword('SuperRoot1!'),
      status: 'active',
    });

    const session = await loginAs(superAdmin.email, 'SuperRoot1!');
    const response = await request(app)
      .get(`/api/v1/tenants/${beta.tenant._id.toString()}`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.tenant.name).toBe('Beta');
  });

  it('returns null tenant for super admin /tenants/me without impersonation', async () => {
    const superAdmin = await User.create({
      tenantId: null,
      role: ROLES.SUPER_ADMIN,
      name: 'Root',
      email: 'root@cupcake.test',
      passwordHash: await hashPassword('SuperRoot1!'),
      status: 'active',
    });

    const session = await loginAs(superAdmin.email, 'SuperRoot1!');
    const response = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.tenant).toBeNull();
  });
});
