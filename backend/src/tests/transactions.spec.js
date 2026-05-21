import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Transaction } from '../modules/transactions/transaction.model.js';
import { AuditLog } from '../modules/audit/audit-log.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;
const password = 'StrongPass123!';

const makeTenant = async ({ name }) => {
  const tenant = await Tenant.create({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
  });
  return tenant;
};

const makeUser = async ({ tenant, email, role = ROLES.CLIENT_ADMIN }) => {
  const user = await User.create({
    tenantId: tenant ? tenant._id : null,
    role,
    name: email,
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  if (tenant && !tenant.ownerUserId) {
    tenant.ownerUserId = user._id;
    await tenant.save();
  }
  return user;
};

const login = async (email) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
};

const makeTransaction = async (tenant, overrides = {}) =>
  Transaction.create({
    tenantId: tenant._id,
    type: 'payment',
    status: 'paid',
    amount: 4900,
    currency: 'USD',
    provider: null,
    providerReference: null,
    description: 'Pro plan monthly subscription',
    planCode: 'pro_monthly',
    paidAt: new Date(),
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

describe('GET /api/v1/transactions', () => {
  it('returns only the calling tenant transactions for client users', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    const beta = await makeTenant({ name: 'Beta' });
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    await makeUser({ tenant: beta, email: 'beta@test.local' });
    await makeTransaction(acme, { description: 'Acme charge' });
    await makeTransaction(acme, { description: 'Acme refund', type: 'refund', status: 'refunded' });
    await makeTransaction(beta, { description: 'Beta charge' });

    const token = await login('acme@test.local');
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(2);
    for (const item of res.body.data.items) {
      expect(item.tenantId).toBe(acme._id.toString());
      expect(typeof item.amount).toBe('number');
      expect(item.currency).toBe('USD');
    }
    expect(res.body.data.pagination).toMatchObject({ page: 1, total: 2 });
  });

  it('responds with the canonical envelope shape', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    const tx = await makeTransaction(acme, {
      provider: 'stripe',
      providerReference: 'pi_demo_123',
    });

    const token = await login('acme@test.local');
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const [first] = res.body.data.items;
    expect(first).toMatchObject({
      id: tx._id.toString(),
      tenantId: acme._id.toString(),
      type: 'payment',
      status: 'paid',
      amount: 4900,
      currency: 'USD',
      provider: 'stripe',
      providerReference: 'pi_demo_123',
      description: 'Pro plan monthly subscription',
      planCode: 'pro_monthly',
    });
    expect(first).toHaveProperty('paidAt');
    expect(first).toHaveProperty('createdAt');
    expect(first).toHaveProperty('updatedAt');
  });

  it('rejects access to another tenant transaction by id', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    const beta = await makeTenant({ name: 'Beta' });
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    await makeUser({ tenant: beta, email: 'beta@test.local' });
    const betaTx = await makeTransaction(beta);

    const token = await login('acme@test.local');
    const res = await request(app)
      .get(`/api/v1/transactions/${betaTx._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 200 with empty items when the tenant has no transactions', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    const token = await login('acme@test.local');
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/transactions');
    expect(res.status).toBe(401);
  });

  it('rejects client members who lack billing.view', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    await makeUser({
      tenant: acme,
      email: 'member@test.local',
      role: ROLES.CLIENT_MEMBER,
    });
    await makeTransaction(acme);
    const token = await login('member@test.local');
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('filters by status and type', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    await makeTransaction(acme, { status: 'paid', type: 'payment' });
    await makeTransaction(acme, { status: 'failed', type: 'payment' });
    await makeTransaction(acme, { status: 'refunded', type: 'refund' });

    const token = await login('acme@test.local');
    const res = await request(app)
      .get('/api/v1/transactions?status=paid&type=payment')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].status).toBe('paid');
  });
});

describe('Super admin transaction access', () => {
  it('sees transactions globally and records an audit entry', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    const beta = await makeTenant({ name: 'Beta' });
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    await makeUser({ tenant: beta, email: 'beta@test.local' });
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    await makeTransaction(acme);
    await makeTransaction(beta);

    const token = await login('super@test.local');
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);

    const audit = await AuditLog.findOne({ action: 'transaction.listed_by_super_admin' });
    expect(audit).not.toBeNull();
    expect(audit.metadata.scope).toBe('global');
    expect(audit.metadata.returned).toBe(2);
  });

  it('can scope to a tenant via the x-impersonate-tenant header', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    const beta = await makeTenant({ name: 'Beta' });
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    await makeUser({ tenant: beta, email: 'beta@test.local' });
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    await makeTransaction(acme, { description: 'Acme only' });
    await makeTransaction(beta, { description: 'Beta only' });

    const token = await login('super@test.local');
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .set('x-impersonate-tenant', acme._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].tenantId).toBe(acme._id.toString());

    const audit = await AuditLog.findOne({ action: 'transaction.listed_by_super_admin' });
    expect(audit).not.toBeNull();
    expect(audit.metadata.scope).toBe('tenant');
  });

  it('audits when a super admin reads a single transaction', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    const tx = await makeTransaction(acme);
    const token = await login('super@test.local');

    const res = await request(app)
      .get(`/api/v1/transactions/${tx._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.transaction.id).toBe(tx._id.toString());

    const audit = await AuditLog.findOne({ action: 'transaction.viewed_by_super_admin' });
    expect(audit).not.toBeNull();
    expect(audit.entityId).toBe(tx._id.toString());
  });
});

describe('Transaction model invariants', () => {
  it('rejects non-integer amounts (must be minor units)', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    await expect(
      Transaction.create({
        tenantId: acme._id,
        type: 'payment',
        status: 'paid',
        amount: 49.5,
        currency: 'USD',
      }),
    ).rejects.toThrow();
  });

  it('rejects malformed currency codes', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    await expect(
      Transaction.create({
        tenantId: acme._id,
        type: 'payment',
        status: 'paid',
        amount: 100,
        currency: 'US$',
      }),
    ).rejects.toThrow();
  });

  it('normalises currency to upper case', async () => {
    const acme = await makeTenant({ name: 'Acme' });
    const tx = await Transaction.create({
      tenantId: acme._id,
      type: 'payment',
      status: 'paid',
      amount: 100,
      currency: 'usd',
    });
    expect(tx.currency).toBe('USD');
  });
});
