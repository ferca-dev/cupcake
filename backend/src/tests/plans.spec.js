import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Plan } from '../modules/plans/plan.model.js';
import { PlanAssignment } from '../modules/plans/plan-assignment.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { FEATURE_KEYS, QUOTA_KEYS } from '../modules/plans/plan.constants.js';
import * as planService from '../modules/plans/plan.service.js';

let app;
const password = 'StrongPass123!';

const createTenant = async (name, email) => {
  const tenant = await Tenant.create({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
  });
  const admin = await User.create({
    tenantId: tenant._id,
    role: ROLES.CLIENT_ADMIN,
    name: `${name} Admin`,
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  tenant.ownerUserId = admin._id;
  await tenant.save();
  return { tenant, admin };
};

const createSuperAdmin = async (email = 'super@plans.test') =>
  User.create({
    tenantId: null,
    role: ROLES.SUPER_ADMIN,
    name: 'Super',
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });

const login = async (email) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
};

const buildPlanPayload = (overrides = {}) => ({
  name: 'Starter',
  code: 'starter',
  description: 'Test plan',
  status: 'active',
  price: { amountMinor: 1000, currency: 'USD', intervalUnit: 'months', intervalCount: 1 },
  features: {
    [FEATURE_KEYS.CAMPAIGNS_EMAIL]: true,
    [FEATURE_KEYS.SURVEYS_PUBLISH]: true,
  },
  quotas: {
    [QUOTA_KEYS.SURVEYS]: 2,
    [QUOTA_KEYS.CONTACTS]: 5,
    [QUOTA_KEYS.RESPONSES_MONTHLY]: 3,
  },
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

describe('Admin /api/v1/admin/plans', () => {
  it('rejects non-super-admins from creating a plan', async () => {
    const { admin } = await createTenant('Acme', 'admin@acme.test');
    const token = await login(admin.email);
    const res = await request(app)
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send(buildPlanPayload());
    expect(res.status).toBe(403);
  });

  it('creates and lists plans with normalised features/quotas', async () => {
    await createSuperAdmin();
    const token = await login('super@plans.test');

    const create = await request(app)
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send(buildPlanPayload({ code: 'starter', isDefault: true }));
    expect(create.status).toBe(201);
    expect(create.body.data.plan).toMatchObject({
      code: 'starter',
      status: 'active',
      isDefault: true,
    });
    expect(create.body.data.plan.features[FEATURE_KEYS.CAMPAIGNS_EMAIL]).toBe(true);
    expect(create.body.data.plan.quotas[QUOTA_KEYS.SURVEYS]).toBe(2);

    const list = await request(app)
      .get('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
  });

  it('rejects duplicate plan codes with a CONFLICT', async () => {
    await createSuperAdmin();
    const token = await login('super@plans.test');
    await request(app)
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send(buildPlanPayload());
    const dup = await request(app)
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send(buildPlanPayload({ name: 'Other' }));
    expect(dup.status).toBe(409);
  });

  it('prevents client admins from changing plan features', async () => {
    const { admin } = await createTenant('Acme', 'admin@acme.test');
    const plan = await Plan.create(buildPlanPayload());
    const token = await login(admin.email);
    const response = await request(app)
      .put(`/api/v1/admin/plans/${plan._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ features: { [FEATURE_KEYS.SURVEYS_PUBLISH]: false } });

    expect(response.status).toBe(403);
    expect((await Plan.findById(plan._id)).features[FEATURE_KEYS.SURVEYS_PUBLISH]).toBe(true);
  });

  it('applies feature changes to an assigned tenant without reassigning its plan', async () => {
    const { tenant, admin } = await createTenant('Acme', 'admin@acme.test');
    await createSuperAdmin();
    const superToken = await login('super@plans.test');
    const clientToken = await login(admin.email);
    const create = await request(app)
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${superToken}`)
      .send(buildPlanPayload());
    expect(create.status).toBe(201);
    const planId = create.body.data.plan.id;
    const assignment = await request(app)
      .post(`/api/v1/admin/tenants/${tenant._id}/plan`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ planId });
    expect(assignment.status).toBe(200);

    const survey = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        title: 'Feature toggle check',
        schema: {
          fields: [{ id: 'f1', type: 'short_text', key: 'name', label: 'Name', order: 1 }],
        },
      });
    expect(survey.status).toBe(201);
    const surveyId = survey.body.data.survey.id;

    for (const enabled of [false, true]) {
      const features = {
        ...create.body.data.plan.features,
        [FEATURE_KEYS.SURVEYS_PUBLISH]: enabled,
      };
      const update = await request(app)
        .put(`/api/v1/admin/plans/${planId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ features });
      expect(update.status).toBe(200);
      const stored = await request(app)
        .get(`/api/v1/admin/plans/${planId}`)
        .set('Authorization', `Bearer ${superToken}`);
      expect(stored.status).toBe(200);
      expect(stored.body.data.plan.features).toEqual(features);
      expect(stored.body.data.plan.quotas).toEqual(create.body.data.plan.quotas);
      expect(stored.body.data.plan.price).toEqual(create.body.data.plan.price);

      const effective = await request(app)
        .get('/api/v1/billing/plan')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(effective.status).toBe(200);
      expect(effective.body.data.plan.features[FEATURE_KEYS.SURVEYS_PUBLISH]).toBe(enabled);

      const publish = await request(app)
        .post(`/api/v1/surveys/${surveyId}/publish`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(publish.status).toBe(enabled ? 200 : 402);
      if (!enabled) expect(publish.body.error.code).toBe('FEATURE_BLOCKED');
    }

    expect(await PlanAssignment.countDocuments({ tenantId: tenant._id })).toBe(1);
  });
});

describe('Tenant plan assignment + history', () => {
  it('records every assignment in the plan history and updates tenant.planId', async () => {
    const { tenant } = await createTenant('Acme', 'admin@acme.test');
    await createSuperAdmin();
    const token = await login('super@plans.test');

    const planA = await request(app)
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send(buildPlanPayload({ code: 'starter', name: 'Starter' }));
    const planB = await request(app)
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send(buildPlanPayload({ code: 'pro', name: 'Pro' }));

    const assign1 = await request(app)
      .post(`/api/v1/admin/tenants/${tenant._id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: planA.body.data.plan.id });
    expect(assign1.status).toBe(200);
    expect(assign1.body.data.changed).toBe(true);

    const refresh = await Tenant.findById(tenant._id);
    expect(refresh.planId.toString()).toBe(planA.body.data.plan.id);

    const assign2 = await request(app)
      .post(`/api/v1/admin/tenants/${tenant._id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: planB.body.data.plan.id, reason: 'Upgrade' });
    expect(assign2.status).toBe(200);

    const history = await PlanAssignment.find({ tenantId: tenant._id }).sort({ assignedAt: 1 });
    expect(history).toHaveLength(2);
    expect(history[0].replacedAt).not.toBeNull(); // closed
    expect(history[1].replacedAt).toBeNull(); // current
    expect(history[1].planCodeSnapshot).toBe('pro');
  });

  it('blocks assigning an archived plan with 409', async () => {
    const { tenant } = await createTenant('Acme', 'admin@acme.test');
    await createSuperAdmin();
    const token = await login('super@plans.test');

    const planRes = await request(app)
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send(buildPlanPayload({ status: 'archived' }));

    const assign = await request(app)
      .post(`/api/v1/admin/tenants/${tenant._id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: planRes.body.data.plan.id });
    expect(assign.status).toBe(409);
  });
});

describe('Feature gates and quota enforcement', () => {
  const setupTenantOnPlan = async (planOverrides) => {
    const { tenant, admin } = await createTenant('Acme', 'admin@acme.test');
    const plan = await Plan.create(
      buildPlanPayload({
        code: 'limited',
        isDefault: true,
        ...planOverrides,
      }),
    );
    await planService.assignPlanToTenant({
      tenantId: tenant._id.toString(),
      planId: plan._id.toString(),
      actor: null,
    });
    return { tenant, admin, plan };
  };

  it('returns 402 with FEATURE_BLOCKED when publishing a survey on a plan without surveys.publish', async () => {
    const { admin } = await setupTenantOnPlan({
      features: { [FEATURE_KEYS.SURVEYS_PUBLISH]: false },
    });
    const token = await login(admin.email);

    // Create a draft survey (allowed) — the quota is high enough.
    const draftPayload = {
      title: 'Demo',
      schema: {
        fields: [
          {
            id: 'f1',
            type: 'short_text',
            key: 'name',
            label: 'Name',
            required: true,
            order: 1,
          },
        ],
      },
    };
    const create = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send(draftPayload);
    expect(create.status).toBe(201);

    const publish = await request(app)
      .post(`/api/v1/surveys/${create.body.data.survey.id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(publish.status).toBe(402);
    expect(publish.body.error.code).toBe('FEATURE_BLOCKED');
    expect(publish.body.error.details[0].feature).toBe(FEATURE_KEYS.SURVEYS_PUBLISH);
  });

  it('returns 402 with QUOTA_EXCEEDED once the survey quota is exhausted', async () => {
    const { admin } = await setupTenantOnPlan({
      quotas: { [QUOTA_KEYS.SURVEYS]: 1 },
    });
    const token = await login(admin.email);

    const first = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'One' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Two' });
    expect(second.status).toBe(402);
    expect(second.body.error.code).toBe('QUOTA_EXCEEDED');
    expect(second.body.error.details[0]).toMatchObject({
      quota: QUOTA_KEYS.SURVEYS,
      limit: 1,
    });
  });

  it('allows the previously-blocked action after upgrading the plan', async () => {
    const { tenant, admin } = await setupTenantOnPlan({
      quotas: { [QUOTA_KEYS.SURVEYS]: 1 },
    });
    const token = await login(admin.email);
    await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'One' });
    const blocked = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Two' });
    expect(blocked.status).toBe(402);

    // Upgrade to a plan with a higher survey quota.
    const upgradedPlan = await Plan.create(
      buildPlanPayload({
        code: 'upgraded',
        quotas: { [QUOTA_KEYS.SURVEYS]: 10 },
      }),
    );
    await planService.assignPlanToTenant({
      tenantId: tenant._id.toString(),
      planId: upgradedPlan._id.toString(),
      actor: null,
    });

    const ok = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Two-after-upgrade' });
    expect(ok.status).toBe(201);
  });

  it('keeps historical surveys readable after a downgrade', async () => {
    const { tenant, admin } = await setupTenantOnPlan({
      quotas: { [QUOTA_KEYS.SURVEYS]: 5 },
    });
    const token = await login(admin.email);
    await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Existing' });
    await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Another' });

    // Downgrade: quota of 1 even though there are already 2 surveys.
    const downgrade = await Plan.create(
      buildPlanPayload({
        code: 'downgraded',
        quotas: { [QUOTA_KEYS.SURVEYS]: 1 },
      }),
    );
    await planService.assignPlanToTenant({
      tenantId: tenant._id.toString(),
      planId: downgrade._id.toString(),
      actor: null,
    });

    // Existing data still readable.
    const list = await request(app).get('/api/v1/surveys').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(2);

    // But creating a new one now blocks.
    const blocked = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Third' });
    expect(blocked.status).toBe(402);
  });

  it('enforces tenant isolation on the plan service', async () => {
    const { tenant: tenantA } = await createTenant('AcmeA', 'a@plan.test');
    const { tenant: tenantB } = await createTenant('AcmeB', 'b@plan.test');
    const plan = await Plan.create(
      buildPlanPayload({
        code: 'iso',
        quotas: { [QUOTA_KEYS.SURVEYS]: 1 },
      }),
    );
    await planService.assignPlanToTenant({
      tenantId: tenantA._id.toString(),
      planId: plan._id.toString(),
      actor: null,
    });

    // Tenant B has no assignment — falls back to DEFAULT_PLAN.
    const usageA = await planService.getUsageReport({ tenantId: tenantA._id.toString() });
    const usageB = await planService.getUsageReport({ tenantId: tenantB._id.toString() });

    expect(usageA.plan.code).toBe('iso');
    expect(usageB.plan.code).toBe('unmanaged'); // built-in fallback
  });
});

describe('Quota usage tracking', () => {
  it('atomically increments monthly counters via consumeMonthlyQuota', async () => {
    const { tenant } = await createTenant('Acme', 'admin@acme.test');
    const plan = await Plan.create(
      buildPlanPayload({
        code: 'monthly',
        quotas: { [QUOTA_KEYS.RESPONSES_MONTHLY]: 100 },
      }),
    );
    await planService.assignPlanToTenant({
      tenantId: tenant._id.toString(),
      planId: plan._id.toString(),
      actor: null,
    });

    for (let i = 0; i < 5; i += 1) {
      await planService.consumeMonthlyQuota({
        tenantId: tenant._id.toString(),
        quotaKey: QUOTA_KEYS.RESPONSES_MONTHLY,
      });
    }

    const report = await planService.getUsageReport({ tenantId: tenant._id.toString() });
    const row = report.quotas.find((q) => q.key === QUOTA_KEYS.RESPONSES_MONTHLY);
    expect(row.used).toBe(5);
    expect(row.remaining).toBe(95);
  });

  it('returns a structured upgrade payload to the client via /billing/plan', async () => {
    const { admin, tenant } = await createTenant('Acme', 'admin@acme.test');
    const plan = await Plan.create(
      buildPlanPayload({
        code: 'visible',
        quotas: { [QUOTA_KEYS.SURVEYS]: 3 },
      }),
    );
    await planService.assignPlanToTenant({
      tenantId: tenant._id.toString(),
      planId: plan._id.toString(),
      actor: null,
    });
    const token = await login(admin.email);

    const planRes = await request(app)
      .get('/api/v1/billing/plan')
      .set('Authorization', `Bearer ${token}`);
    expect(planRes.status).toBe(200);
    expect(planRes.body.data.plan.code).toBe('visible');
    expect(planRes.body.data.plan.quotas[QUOTA_KEYS.SURVEYS]).toBe(3);

    const usageRes = await request(app)
      .get('/api/v1/billing/usage')
      .set('Authorization', `Bearer ${token}`);
    expect(usageRes.status).toBe(200);
    expect(usageRes.body.data.plan.code).toBe('visible');
    expect(Array.isArray(usageRes.body.data.quotas)).toBe(true);
  });
});
