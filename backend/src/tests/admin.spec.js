import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { RefreshToken } from '../modules/auth/refresh-token.model.js';
import { AuditLog } from '../modules/audit/audit-log.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const password = 'StrongPass123!';

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

const createSuperAdmin = async ({ email = 'super@test.local' } = {}) =>
  User.create({
    tenantId: null,
    role: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data;
};

const loginToken = async (email) => (await login(email)).accessToken;

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

describe('GET /api/v1/admin/tenants', () => {
  it('returns a paginated list with user counts for super admins', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    await createTenantWithAdmin({ tenantName: 'Beta', email: 'beta@test.local' });
    await createSuperAdmin();

    const token = await loginToken('super@test.local');

    const response = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    const acme = response.body.data.items.find((t) => t.name === 'Acme');
    expect(acme.userCount).toBe(1);
    expect(response.body.data.pagination.total).toBe(2);
  });

  it('supports search and status filters', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    await createTenantWithAdmin({ tenantName: 'Beta', email: 'beta@test.local' });
    await Tenant.updateOne({ name: 'Beta' }, { $set: { status: 'suspended' } });
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const search = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ search: 'beta' })
      .set('Authorization', `Bearer ${token}`);
    expect(search.status).toBe(200);
    expect(search.body.data.items.map((t) => t.name)).toEqual(['Beta']);

    const suspended = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ status: 'suspended' })
      .set('Authorization', `Bearer ${token}`);
    expect(suspended.body.data.items.map((t) => t.name)).toEqual(['Beta']);
  });

  it('rejects unauthenticated callers', async () => {
    const response = await request(app).get('/api/v1/admin/tenants');
    expect(response.status).toBe(401);
  });

  it('rejects non-super-admin clients with 403', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await loginToken('acme@test.local');

    const response = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });
});

describe('POST /api/v1/admin/tenants', () => {
  it('creates a tenant and optionally provisions a client admin', async () => {
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const response = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Gamma Inc',
        admin: {
          name: 'Gamma Owner',
          email: 'gamma-owner@test.local',
          password: 'GammaPass123!',
        },
      });

    expect(response.status).toBe(201);
    const { tenant } = response.body.data;
    expect(tenant.slug).toBe('gamma-inc');
    expect(tenant.status).toBe('active');
    expect(tenant.userCount).toBe(1);
    expect(tenant.owner?.email).toBe('gamma-owner@test.local');

    const dbAdmin = await User.findOne({ email: 'gamma-owner@test.local' });
    expect(dbAdmin?.role).toBe(ROLES.CLIENT_ADMIN);
    expect(dbAdmin?.tenantId?.toString()).toBe(tenant.id);

    const logs = await AuditLog.find({ entityType: 'tenant', action: 'admin.tenant.created' });
    expect(logs.length).toBe(1);
    expect(logs[0].metadata?.slug).toBe('gamma-inc');
  });

  it('rejects duplicate slugs with 409', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const response = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Different', slug: 'acme' });
    expect(response.status).toBe(409);
  });

  it('rolls back the tenant when the admin email is already taken', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'taken@test.local' });
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const response = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Should Roll Back',
        admin: {
          name: 'Dup',
          email: 'taken@test.local',
          password: 'GammaPass123!',
        },
      });
    expect(response.status).toBe(409);
    const leftover = await Tenant.findOne({ name: 'Should Roll Back' });
    expect(leftover).toBeNull();
  });

  it('rejects client roles with 403 even with a valid token', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await loginToken('acme@test.local');

    const response = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hostile' });
    expect(response.status).toBe(403);
  });
});

describe('PUT /api/v1/admin/tenants/:id', () => {
  it('updates editable fields and audits the change', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const response = await request(app)
      .put(`/api/v1/admin/tenants/${tenant._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Renamed', settings: { timezone: 'Europe/London' } });

    expect(response.status).toBe(200);
    expect(response.body.data.tenant.name).toBe('Acme Renamed');
    expect(response.body.data.tenant.settings.timezone).toBe('Europe/London');

    const log = await AuditLog.findOne({
      entityType: 'tenant',
      action: 'admin.tenant.updated',
      entityId: tenant._id.toString(),
    });
    expect(log).not.toBeNull();
  });

  it('rejects empty payloads with 422', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const response = await request(app)
      .put(`/api/v1/admin/tenants/${tenant._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(422);
  });
});

describe('PATCH /api/v1/admin/tenants/:id/status', () => {
  it('suspends a tenant and revokes its active refresh tokens', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    await createSuperAdmin();
    const clientSession = await login('acme@test.local');
    const adminToken = await loginToken('super@test.local');

    const stored = await RefreshToken.findOne({ userId: user._id });
    expect(stored?.revokedAt).toBeNull();

    const response = await request(app)
      .patch(`/api/v1/admin/tenants/${tenant._id.toString()}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended', reason: 'late payment' });

    expect(response.status).toBe(200);
    expect(response.body.data.tenant.status).toBe('suspended');
    expect(response.body.data.revokedTokens).toBeGreaterThan(0);

    const refreshed = await RefreshToken.findOne({ userId: user._id });
    expect(refreshed?.revokedAt).not.toBeNull();

    // The previously issued access token must no longer authenticate against
    // tenant-scoped endpoints because authenticate() rejects suspended tenants.
    const meAttempt = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${clientSession.accessToken}`);
    expect(meAttempt.status).toBe(401);

    // Logging in fresh fails because the tenant is suspended.
    const loginAttempt = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@test.local', password });
    expect(loginAttempt.status).toBe(401);
  });

  it('cancels a tenant and deactivates its users', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    await createSuperAdmin();
    const adminToken = await loginToken('super@test.local');

    const response = await request(app)
      .patch(`/api/v1/admin/tenants/${tenant._id.toString()}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });

    expect(response.status).toBe(200);
    expect(response.body.data.tenant.status).toBe('cancelled');
    expect(response.body.data.affectedUsers).toBeGreaterThan(0);

    const reloaded = await User.findById(user._id);
    expect(reloaded.status).toBe('inactive');

    const log = await AuditLog.findOne({
      entityType: 'tenant',
      action: 'admin.tenant.status_changed',
    });
    expect(log?.metadata?.nextStatus).toBe('cancelled');
  });

  it('restores cancelled users when reactivating a tenant', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    await Tenant.updateOne({ _id: tenant._id }, { $set: { status: 'cancelled' } });
    await User.updateOne({ _id: user._id }, { $set: { status: 'inactive' } });
    await createSuperAdmin();
    const adminToken = await loginToken('super@test.local');

    const response = await request(app)
      .patch(`/api/v1/admin/tenants/${tenant._id.toString()}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    expect(response.status).toBe(200);
    const reloaded = await User.findById(user._id);
    expect(reloaded.status).toBe('active');
  });

  it('rejects unknown statuses with 422', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const response = await request(app)
      .patch(`/api/v1/admin/tenants/${tenant._id.toString()}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'bogus' });
    expect(response.status).toBe(422);
  });
});

describe('GET /api/v1/admin/tenants/:id/users', () => {
  it('lists every user inside the tenant', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    await User.create({
      tenantId: tenant._id,
      role: ROLES.CLIENT_MEMBER,
      name: 'Member',
      email: 'member@test.local',
      passwordHash: await hashPassword(password),
      status: 'active',
    });
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const response = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id.toString()}/users`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.items.map((u) => u.email).sort()).toEqual([
      'acme@test.local',
      'member@test.local',
    ]);
  });
});

describe('GET /api/v1/admin/metrics', () => {
  it('returns global metrics for the super admin', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    await createSuperAdmin();
    const token = await loginToken('super@test.local');

    const response = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.metrics).toHaveProperty('clients');
    expect(response.body.data.metrics.clients.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects client users', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await loginToken('acme@test.local');
    const response = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });
});

describe('Tenant access gating in authenticate middleware', () => {
  it('blocks an already-issued access token once the tenant is suspended', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const session = await login('acme@test.local');

    const meOk = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(meOk.status).toBe(200);

    await Tenant.updateOne({ _id: tenant._id }, { $set: { status: 'suspended' } });

    const meBlocked = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(meBlocked.status).toBe(401);
  });
});
