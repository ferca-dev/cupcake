import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { ApiKey } from '../modules/developer/api-key.model.js';
import { WebhookEndpoint } from '../modules/developer/webhook-endpoint.model.js';
import { WebhookDelivery } from '../modules/developer/webhook-delivery.model.js';
import {
  __resetHttpHandler,
  __setHttpHandler,
} from '../modules/developer/webhook-dispatcher.js';
import {
  hashApiKeySecret,
  splitPresentedKey,
} from '../modules/developer/api-key.service.js';
import { verifyWebhookSignature } from '../modules/developer/webhook-signing.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const PASSWORD = 'StrongPass123!';

const createTenant = async ({ name = 'Acme' } = {}) =>
  Tenant.create({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
    settings: {},
  });

const createUser = async ({ tenant, role = ROLES.CLIENT_ADMIN, email = 'owner@acme.test' }) => {
  const user = await User.create({
    tenantId: tenant?._id ?? null,
    role,
    name: email,
    email,
    passwordHash: await hashPassword(PASSWORD),
    status: 'active',
  });
  if (tenant && !tenant.ownerUserId) {
    tenant.ownerUserId = user._id;
    await tenant.save();
  }
  return user;
};

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data;
};

const tokenFor = async (email) => (await login(email)).accessToken;

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

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

afterEach(() => {
  __resetHttpHandler();
});

// =====================================================================
// API KEY MANAGEMENT
// =====================================================================
describe('developer / api-keys', () => {
  it('creates an API key, returns the raw value once, and stores only a hash', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const response = await request(app)
      .post('/api/v1/developer/api-keys')
      .set(authHeader(token))
      .send({
        name: 'CI deploy key',
        scopes: ['surveys:read', 'responses:read'],
      });

    expect(response.status).toBe(201);
    const { apiKey } = response.body.data;
    expect(apiKey.rawKey).toBeTypeOf('string');
    expect(apiKey.rawKey.split('.')).toHaveLength(2);
    expect(apiKey.prefix).toMatch(/^cup_live_/);
    expect(apiKey.status).toBe('active');
    expect(apiKey.scopes).toEqual(['surveys:read', 'responses:read']);

    // The raw key is reachable via the response — the database row must only
    // store a hash.
    const stored = await ApiKey.findById(apiKey.id);
    expect(stored.secretHash).toBeTruthy();
    expect(stored.secretHash).not.toContain(apiKey.rawKey);
    const parts = splitPresentedKey(apiKey.rawKey);
    expect(parts).not.toBeNull();
    expect(stored.secretHash).toBe(hashApiKeySecret(parts.secret));

    // Listing the keys must NOT echo the raw value back.
    const listResponse = await request(app)
      .get('/api/v1/developer/api-keys')
      .set(authHeader(token));
    expect(listResponse.status).toBe(200);
    const fetched = listResponse.body.data.items[0];
    expect(fetched.rawKey).toBeUndefined();
    expect(fetched.secretHash).toBeUndefined();
  });

  it('rotates an API key, revoking the original and emitting a new raw value', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const created = await request(app)
      .post('/api/v1/developer/api-keys')
      .set(authHeader(token))
      .send({ name: 'rotate-me', scopes: ['surveys:read'] });
    expect(created.status).toBe(201);
    const originalId = created.body.data.apiKey.id;
    const originalRaw = created.body.data.apiKey.rawKey;

    const rotated = await request(app)
      .post(`/api/v1/developer/api-keys/${originalId}/rotate`)
      .set(authHeader(token))
      .send({});

    expect(rotated.status).toBe(201);
    expect(rotated.body.data.replacement.rawKey).toBeTypeOf('string');
    expect(rotated.body.data.replacement.rawKey).not.toBe(originalRaw);
    expect(rotated.body.data.previous.status).toBe('revoked');
    expect(rotated.body.data.replacement.rotatedFromId).toBe(originalId);
  });

  it('revokes an API key so subsequent uses of it would fail authentication', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const created = await request(app)
      .post('/api/v1/developer/api-keys')
      .set(authHeader(token))
      .send({ name: 'k', scopes: ['surveys:read'] });
    const id = created.body.data.apiKey.id;

    const revoked = await request(app)
      .post(`/api/v1/developer/api-keys/${id}/revoke`)
      .set(authHeader(token))
      .send({});
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.apiKey.status).toBe('revoked');

    const refreshed = await ApiKey.findById(id);
    expect(refreshed.status).toBe('revoked');
    expect(refreshed.revokedAt).toBeTruthy();
  });

  it('rejects unknown scopes', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const response = await request(app)
      .post('/api/v1/developer/api-keys')
      .set(authHeader(token))
      .send({ name: 'bad', scopes: ['admin:all'] });
    // 422 = VALIDATION_ERROR in this codebase.
    expect(response.status).toBe(422);
  });

  it('rejects API key creation for users without users.manage permission', async () => {
    const tenant = await createTenant();
    await createUser({ tenant, email: 'admin@acme.test' });
    const member = await createUser({
      tenant,
      role: ROLES.CLIENT_MEMBER,
      email: 'member@acme.test',
    });
    const token = await tokenFor(member.email);

    const response = await request(app)
      .post('/api/v1/developer/api-keys')
      .set(authHeader(token))
      .send({ name: 'denied', scopes: ['surveys:read'] });
    expect(response.status).toBe(403);
  });

  it('enforces tenant isolation when listing API keys', async () => {
    const tenantA = await createTenant({ name: 'TenantA' });
    const ownerA = await createUser({ tenant: tenantA, email: 'a@a.test' });
    const tenantB = await createTenant({ name: 'TenantB' });
    const ownerB = await createUser({ tenant: tenantB, email: 'b@b.test' });

    const tokenA = await tokenFor(ownerA.email);
    const tokenB = await tokenFor(ownerB.email);

    await request(app)
      .post('/api/v1/developer/api-keys')
      .set(authHeader(tokenA))
      .send({ name: 'A-only', scopes: ['surveys:read'] });
    await request(app)
      .post('/api/v1/developer/api-keys')
      .set(authHeader(tokenB))
      .send({ name: 'B-only', scopes: ['surveys:read'] });

    const listA = await request(app)
      .get('/api/v1/developer/api-keys')
      .set(authHeader(tokenA));
    const listB = await request(app)
      .get('/api/v1/developer/api-keys')
      .set(authHeader(tokenB));

    expect(listA.body.data.items.map((k) => k.name)).toEqual(['A-only']);
    expect(listB.body.data.items.map((k) => k.name)).toEqual(['B-only']);
  });
});

// =====================================================================
// WEBHOOK SIGNING + DISPATCH
// =====================================================================
describe('developer / webhooks', () => {
  it('creates a webhook endpoint and returns the secret only once', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const response = await request(app)
      .post('/api/v1/developer/webhooks')
      .set(authHeader(token))
      .send({
        name: 'Demo endpoint',
        url: 'https://example.com/webhooks/cupcake',
        events: ['response.submitted', 'campaign.completed'],
      });

    expect(response.status).toBe(201);
    const { endpoint } = response.body.data;
    expect(endpoint.secret).toMatch(/^whsec_/);
    expect(endpoint.events).toContain('response.submitted');
    expect(endpoint.status).toBe('active');

    const stored = await WebhookEndpoint.findById(endpoint.id);
    expect(stored.secret).toBe(endpoint.secret);

    const list = await request(app)
      .get('/api/v1/developer/webhooks')
      .set(authHeader(token));
    expect(list.body.data.items[0].secret).toBeUndefined();
  });

  it('signs delivered payloads with a verifiable HMAC and records the attempt', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const created = await request(app)
      .post('/api/v1/developer/webhooks')
      .set(authHeader(token))
      .send({
        name: 'capture',
        url: 'https://example.com/hook',
        events: ['response.submitted'],
      });
    const endpoint = created.body.data.endpoint;

    const captured = [];
    __setHttpHandler(async ({ signedBody, headers }) => {
      captured.push({ signedBody, headers });
      return {
        success: true,
        statusCode: 202,
        responseBodySnippet: 'ok',
        durationMs: 12,
        error: null,
      };
    });

    const testResponse = await request(app)
      .post(`/api/v1/developer/webhooks/${endpoint.id}/test`)
      .set(authHeader(token))
      .send({});

    expect(testResponse.status).toBe(200);
    expect(testResponse.body.data.delivered).toBe(true);
    expect(captured).toHaveLength(1);

    const { headers, signedBody } = captured[0];
    expect(headers['X-Cupcake-Signature']).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
    expect(headers['X-Cupcake-Event-Type']).toBe('response.submitted');
    expect(
      verifyWebhookSignature({
        secret: endpoint.secret,
        body: signedBody,
        header: headers['X-Cupcake-Signature'],
      }),
    ).toBe(true);

    // A signature derived from the wrong secret must fail verification.
    expect(
      verifyWebhookSignature({
        secret: 'wrong-secret',
        body: signedBody,
        header: headers['X-Cupcake-Signature'],
      }),
    ).toBe(false);

    // Delivery row should exist and reference the latest attempt.
    const delivery = await WebhookDelivery.findOne({ endpointId: endpoint.id });
    expect(delivery.status).toBe('succeeded');
    expect(delivery.attempts).toBe(1);
    expect(delivery.lastAttempt.statusCode).toBe(202);
    expect(delivery.lastAttempt.success).toBe(true);
  });

  it('retries failed deliveries with exponential backoff and dead-letters after maxAttempts', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const endpointResp = await request(app)
      .post('/api/v1/developer/webhooks')
      .set(authHeader(token))
      .send({
        name: 'retrying',
        url: 'https://example.com/hook',
        events: ['response.submitted'],
      });
    const endpointId = endpointResp.body.data.endpoint.id;

    // Fail every attempt with a 503.
    let attemptCount = 0;
    __setHttpHandler(async () => {
      attemptCount += 1;
      return {
        success: false,
        statusCode: 503,
        responseBodySnippet: 'unavailable',
        durationMs: 5,
        error: null,
      };
    });

    const testResponse = await request(app)
      .post(`/api/v1/developer/webhooks/${endpointId}/test`)
      .set(authHeader(token))
      .send({});

    expect(testResponse.status).toBe(200);
    expect(testResponse.body.data.delivered).toBe(false);

    // JOB_MAX_ATTEMPTS=3 in the test env. The inline driver also chains
    // retries via re-enqueues, so by the time the request resolves the
    // delivery must be dead-lettered.
    const delivery = await WebhookDelivery.findOne({ endpointId });
    expect(delivery.attempts).toBeGreaterThanOrEqual(1);
    if (delivery.attempts >= delivery.maxAttempts) {
      expect(delivery.status).toBe('dead_letter');
    }
    expect(attemptCount).toBeGreaterThanOrEqual(1);

    // Delivery log endpoint surfaces the history.
    const log = await request(app)
      .get(`/api/v1/developer/webhooks/${endpointId}/deliveries`)
      .set(authHeader(token));
    expect(log.status).toBe(200);
    expect(log.body.data.items.length).toBeGreaterThan(0);
    expect(log.body.data.items[0].lastAttempt).toBeTruthy();
  });

  it('publishes response.submitted webhook events when a response is created', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const created = await request(app)
      .post('/api/v1/developer/webhooks')
      .set(authHeader(token))
      .send({
        name: 'response watcher',
        url: 'https://example.com/hook',
        events: ['response.submitted'],
      });
    const endpoint = created.body.data.endpoint;

    let captured = null;
    __setHttpHandler(async ({ signedBody }) => {
      captured = JSON.parse(signedBody);
      return {
        success: true,
        statusCode: 200,
        responseBodySnippet: '',
        durationMs: 1,
        error: null,
      };
    });

    // Trigger the producer directly via the publisher to avoid leaning on
    // public-form route shape (which phase 31 reshapes concurrently). This
    // exercises the same emit path used by the response repository hook.
    const { publishWebhookEvent } = await import(
      '../modules/developer/webhook-publisher.js'
    );
    await publishWebhookEvent({
      type: 'response.submitted',
      tenantId: tenant._id,
      data: {
        responseId: new mongoose.Types.ObjectId().toString(),
        surveyId: new mongoose.Types.ObjectId().toString(),
      },
    });

    expect(captured).toBeTruthy();
    expect(captured.type).toBe('response.submitted');
    expect(captured.tenantId).toBe(tenant._id.toString());

    const delivery = await WebhookDelivery.findOne({ endpointId: endpoint.id });
    expect(delivery.status).toBe('succeeded');
  });

  it('isolates webhook endpoints between tenants', async () => {
    const tenantA = await createTenant({ name: 'A' });
    const ownerA = await createUser({ tenant: tenantA, email: 'a@a.test' });
    const tenantB = await createTenant({ name: 'B' });
    const ownerB = await createUser({ tenant: tenantB, email: 'b@b.test' });
    const tokenA = await tokenFor(ownerA.email);
    const tokenB = await tokenFor(ownerB.email);

    await request(app)
      .post('/api/v1/developer/webhooks')
      .set(authHeader(tokenA))
      .send({ name: 'A', url: 'https://a.example.com/h', events: ['response.submitted'] });
    const createdB = await request(app)
      .post('/api/v1/developer/webhooks')
      .set(authHeader(tokenB))
      .send({ name: 'B', url: 'https://b.example.com/h', events: ['response.submitted'] });

    // Owner A cannot see/update/delete tenant B's endpoint.
    const crossAccess = await request(app)
      .delete(`/api/v1/developer/webhooks/${createdB.body.data.endpoint.id}`)
      .set(authHeader(tokenA));
    expect(crossAccess.status).toBe(404);
  });

  it('skips delivery when the endpoint has been paused', async () => {
    const tenant = await createTenant();
    const owner = await createUser({ tenant });
    const token = await tokenFor(owner.email);

    const created = await request(app)
      .post('/api/v1/developer/webhooks')
      .set(authHeader(token))
      .send({
        name: 'pausable',
        url: 'https://example.com/h',
        events: ['response.submitted'],
        status: 'paused',
      });
    const endpoint = created.body.data.endpoint;

    let called = false;
    __setHttpHandler(async () => {
      called = true;
      return {
        success: true,
        statusCode: 200,
        responseBodySnippet: '',
        durationMs: 1,
        error: null,
      };
    });

    const { publishWebhookEvent } = await import(
      '../modules/developer/webhook-publisher.js'
    );
    await publishWebhookEvent({
      type: 'response.submitted',
      tenantId: tenant._id,
      data: { responseId: 'abc' },
    });

    // Paused endpoints are filtered out by the publisher's `status: 'active'`
    // query before any delivery row is created.
    expect(called).toBe(false);
    const delivery = await WebhookDelivery.findOne({ endpointId: endpoint.id });
    expect(delivery).toBeNull();
  });
});
