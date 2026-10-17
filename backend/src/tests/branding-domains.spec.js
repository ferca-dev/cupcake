import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Plan } from '../modules/plans/plan.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { CustomDomain } from '../modules/domains/custom-domain.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { FEATURE_KEYS } from '../modules/plans/plan.constants.js';
import { assignPlanToTenant } from '../modules/plans/plan.service.js';
import { __testing as domainTesting } from '../modules/domains/custom-domain.service.js';

let app;
const password = 'StrongPass123!';

const sampleField = () => ({
  id: 'field_name',
  type: 'short_text',
  key: 'name',
  label: 'Your name',
  required: true,
  order: 1,
  options: [],
  validation: {},
  visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
  settings: { width: 'full', imageUrl: null },
});

const sampleSchema = () => ({
  fields: [sampleField()],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

const createTenantAndAdmin = async ({ name = 'Acme', email = 'admin@acme.test' } = {}) => {
  const tenant = await Tenant.create({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
  });
  const user = await User.create({
    tenantId: tenant._id,
    role: ROLES.CLIENT_ADMIN,
    name: `${name} Admin`,
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  tenant.ownerUserId = user._id;
  await tenant.save();
  return { tenant, user };
};

const createSuperAdmin = async () =>
  User.create({
    tenantId: null,
    role: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    email: 'super@domains.test',
    passwordHash: await hashPassword(password),
    status: 'active',
  });

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

const assignFeatures = async (tenant, features) => {
  const plan = await Plan.create({
    name: `Plan ${tenant.slug}`,
    code: `plan-${tenant.slug}`,
    status: 'active',
    features,
    quotas: {},
  });
  await assignPlanToTenant({
    tenantId: tenant._id.toString(),
    planId: plan._id.toString(),
    actor: null,
  });
  return plan;
};

const publishSurvey = async ({ tenant, user, slug = 'feedback', title = 'Feedback' }) => {
  const survey = await Survey.create({
    tenantId: tenant._id,
    title,
    slug,
    status: 'draft',
    currentDraftSchema: sampleSchema(),
    createdBy: user._id,
  });
  const version = await SurveyVersion.create({
    tenantId: tenant._id,
    surveyId: survey._id,
    versionNumber: 1,
    schema: survey.currentDraftSchema,
    settings: survey.settings.toObject(),
    publishedBy: user._id,
    publishedAt: new Date(),
  });
  survey.status = 'published';
  survey.publishedVersionId = version._id;
  survey.publishedAt = new Date();
  await survey.save();
  return { survey, version };
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
  domainTesting.resetTxtResolver();
});

afterEach(() => {
  domainTesting.resetTxtResolver();
});

describe('Tenant branding', () => {
  it('lets a super admin hide, show and reset one client footer without changing plans or other clients', async () => {
    const first = await createTenantAndAdmin({
      name: 'Servicios Sierra',
      email: 'sierra@example.test',
    });
    const second = await createTenantAndAdmin({
      name: 'Consultora Encinos',
      email: 'encinos@example.test',
    });
    await assignFeatures(first.tenant, { [FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING]: false });
    await publishSurvey({ ...first, slug: 'sierra' });
    await publishSurvey({ ...second, slug: 'encinos' });
    await createSuperAdmin();
    const superToken = await login('super@domains.test');
    const url = `/api/v1/admin/tenants/${first.tenant.id}`;
    for (const [setting, visible] of [
      [false, false],
      [true, true],
      [null, true],
    ]) {
      const update = await request(app)
        .put(url)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ settings: { publicFormPoweredBy: setting } });
      expect(update.status).toBe(200);
      expect(update.body.data.tenant.settings.publicFormPoweredBy).toBe(setting);
      const reloaded = await request(app).get(url).set('Authorization', `Bearer ${superToken}`);
      expect(reloaded.body.data.tenant.settings.publicFormPoweredBy).toBe(setting);
      const form = await request(app).get('/api/v1/public/forms/sierra');
      expect(form.status).toBe(200);
      expect(form.body.data.branding.showPoweredBy).toBe(visible);
      const other = await request(app).get('/api/v1/public/forms/encinos');
      expect(other.body.data.branding.showPoweredBy).toBe(true);
    }
  });

  it('preserves the admin footer override when clients edit branding and restores white-label behavior on reset', async () => {
    const { tenant, user } = await createTenantAndAdmin({
      name: 'Estudios del Norte',
      email: 'norte@example.test',
    });
    await assignFeatures(tenant, {
      [FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING]: true,
      [FEATURE_KEYS.SURVEYS_WHITE_LABEL]: true,
    });
    await publishSurvey({ tenant, user });
    await createSuperAdmin();
    const superToken = await login('super@domains.test');
    const clientToken = await login(user.email);
    const url = `/api/v1/admin/tenants/${tenant.id}`;
    const update = await request(app)
      .put(url)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ settings: { publicFormPoweredBy: true } });
    expect(update.status).toBe(200);
    const brandingUpdate = await request(app)
      .put('/api/v1/branding')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ whiteLabel: true, primaryColor: '#14532d' });
    expect(brandingUpdate.status).toBe(200);
    const form = await request(app).get('/api/v1/public/forms/feedback');
    expect(form.body.data.branding).toMatchObject({
      whiteLabel: true,
      showPoweredBy: true,
      primaryColor: '#14532d',
    });
    await request(app)
      .put(url)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ settings: { publicFormPoweredBy: null } })
      .expect(200);
    const resetForm = await request(app).get('/api/v1/public/forms/feedback');
    expect(resetForm.body.data.branding).toMatchObject({
      whiteLabel: true,
      showPoweredBy: false,
      primaryColor: '#14532d',
    });
  });

  it('rejects client attempts to change the administrator footer setting', async () => {
    const { tenant, user } = await createTenantAndAdmin({
      name: 'Servicios Encinos',
      email: 'servicios@example.test',
    });
    await assignFeatures(tenant, { [FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING]: true });
    const token = await login(user.email);
    await request(app)
      .put(`/api/v1/admin/tenants/${tenant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settings: { publicFormPoweredBy: false } })
      .expect(403);
    await request(app)
      .put('/api/v1/branding')
      .set('Authorization', `Bearer ${token}`)
      .send({ publicFormPoweredBy: false })
      .expect(422);
    expect((await Tenant.findById(tenant.id)).settings.publicFormPoweredBy).toBeNull();
  });

  it('plan-gates branding updates and applies enabled branding to public forms', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await assignFeatures(tenant, {
      [FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING]: true,
      [FEATURE_KEYS.SURVEYS_WHITE_LABEL]: true,
    });
    await publishSurvey({ tenant, user });
    const token = await login(user.email);

    const update = await request(app)
      .put('/api/v1/branding')
      .set('Authorization', `Bearer ${token}`)
      .send({
        logoUrl: 'https://cdn.example.com/logo.png',
        primaryColor: '#14532d',
        accentColor: '#0f766e',
        backgroundColor: '#ffffff',
        textColor: '#111827',
        publicFormTheme: 'light',
        whiteLabel: true,
      });

    expect(update.status).toBe(200);
    expect(update.body.data.branding).toMatchObject({
      logoUrl: 'https://cdn.example.com/logo.png',
      primaryColor: '#14532d',
      whiteLabel: true,
    });

    const publicForm = await request(app).get('/api/v1/public/forms/feedback');
    expect(publicForm.status).toBe(200);
    expect(publicForm.body.data.branding).toMatchObject({
      logoUrl: 'https://cdn.example.com/logo.png',
      primaryColor: '#14532d',
      whiteLabel: true,
    });
  });

  it('blocks branding updates when the plan does not include custom branding', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await assignFeatures(tenant, { [FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING]: false });
    const token = await login(user.email);

    const response = await request(app)
      .put('/api/v1/branding')
      .set('Authorization', `Bearer ${token}`)
      .send({ primaryColor: '#14532d' });

    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe('FEATURE_BLOCKED');
  });

  it('rejects inaccessible text and background color contrast', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await assignFeatures(tenant, { [FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING]: true });
    const token = await login(user.email);

    const response = await request(app)
      .put('/api/v1/branding')
      .set('Authorization', `Bearer ${token}`)
      .send({ backgroundColor: '#ffffff', textColor: '#ffffff' });

    expect(response.status).toBe(422);
  });
});

describe('Custom domains', () => {
  it('requires DNS proof before tenant activation', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await assignFeatures(tenant, { [FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS]: true });
    const token = await login(user.email);

    const create = await request(app)
      .post('/api/v1/domains')
      .set('Authorization', `Bearer ${token}`)
      .send({ hostname: 'forms.example.org' });

    expect(create.status).toBe(201);
    const domain = create.body.data.domain;

    const activateBeforeVerify = await request(app)
      .patch(`/api/v1/domains/${domain.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(activateBeforeVerify.status).toBe(409);

    const missingDns = await request(app)
      .post(`/api/v1/domains/${domain.id}/verify`)
      .set('Authorization', `Bearer ${token}`);
    expect(missingDns.status).toBe(409);

    domainTesting.setTxtResolver(async () => [[domain.dnsRecord.value]]);
    const verify = await request(app)
      .post(`/api/v1/domains/${domain.id}/verify`)
      .set('Authorization', `Bearer ${token}`);
    expect(verify.status).toBe(200);
    expect(verify.body.data.domain.status).toBe('verified');

    const activate = await request(app)
      .patch(`/api/v1/domains/${domain.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(activate.status).toBe(200);
    expect(activate.body.data.domain.status).toBe('active');
  });

  it('resolves public forms through an active host without leaking another tenant', async () => {
    const { tenant, user } = await createTenantAndAdmin({
      name: 'Tenant One',
      email: 'one@domains.test',
    });
    const other = await createTenantAndAdmin({
      name: 'Tenant Two',
      email: 'two@domains.test',
    });
    await publishSurvey({ tenant, user, slug: 'tenant-form' });
    await publishSurvey({ tenant: other.tenant, user: other.user, slug: 'other-form' });
    await CustomDomain.create({
      tenantId: tenant._id,
      hostname: 'forms.tenant-one.testsite.com',
      status: 'active',
      verificationToken: 'token',
      dnsRecord: {
        type: 'TXT',
        name: '_cupcake-verification.forms.tenant-one.testsite.com',
        value: 'cupcake-domain-verification=token',
      },
      verifiedAt: new Date(),
      activatedAt: new Date(),
    });

    const own = await request(app)
      .get('/api/v1/public/forms/tenant-form')
      .set('Host', 'forms.tenant-one.testsite.com');
    expect(own.status).toBe(200);
    expect(own.body.data.survey.slug).toBe('tenant-form');
    expect(own.body.data.domain.hostname).toBe('forms.tenant-one.testsite.com');

    const leaked = await request(app)
      .get('/api/v1/public/forms/other-form')
      .set('Host', 'forms.tenant-one.testsite.com');
    expect(leaked.status).toBe(404);
  });

  it('blocks reserved hostnames and plan-gates domain requests', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await assignFeatures(tenant, { [FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS]: true });
    const token = await login(user.email);

    const reserved = await request(app)
      .post('/api/v1/domains')
      .set('Authorization', `Bearer ${token}`)
      .send({ hostname: 'localhost' });
    expect(reserved.status).toBe(422);

    const blockedTenant = await createTenantAndAdmin({
      name: 'Blocked',
      email: 'blocked@domains.test',
    });
    await assignFeatures(blockedTenant.tenant, { [FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS]: false });
    const blockedToken = await login(blockedTenant.user.email);
    const blocked = await request(app)
      .post('/api/v1/domains')
      .set('Authorization', `Bearer ${blockedToken}`)
      .send({ hostname: 'forms.blocked-example.com' });
    expect(blocked.status).toBe(402);
  });

  it('lets super admins verify and activate a domain override without DNS', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await assignFeatures(tenant, { [FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS]: true });
    await createSuperAdmin();
    const token = await login(user.email);
    const superToken = await login('super@domains.test');

    const create = await request(app)
      .post('/api/v1/domains')
      .set('Authorization', `Bearer ${token}`)
      .send({ hostname: 'forms.override-example.com' });

    const override = await request(app)
      .post(`/api/v1/admin/domains/${create.body.data.domain.id}/verify`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ activate: true });

    expect(override.status).toBe(200);
    expect(override.body.data.domain.status).toBe('active');
    expect(override.body.data.domain.adminOverrideAt).toBeTruthy();
  });
});
