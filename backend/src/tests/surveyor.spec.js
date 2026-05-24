import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { Response } from '../modules/responses/response.model.js';
import { AuditLog } from '../modules/audit/audit-log.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { TEAM_AUDIT_ACTIONS } from '../modules/team/team.service.js';
import { SURVEYOR_AUDIT_ACTIONS } from '../modules/surveyor/surveyor.service.js';
import { SURVEYOR_ACTIVITY_AUDIT_ACTIONS } from '../modules/surveyor-activity/surveyor-activity.service.js';

let app;

const password = 'StrongPass123!';

const sampleField = (overrides = {}) => ({
  id: 'field_name',
  type: 'short_text',
  key: 'name',
  label: 'Name',
  placeholder: '',
  helpText: '',
  required: true,
  order: 1,
  sectionId: null,
  options: [],
  validation: { minLength: null, maxLength: null, min: null, max: null, regex: null },
  visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
  settings: { width: 'full', imageUrl: null },
  ...overrides,
});

const sampleSchema = (fields = [sampleField()]) => ({
  fields,
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

const sampleLocation = (overrides = {}) => ({
  latitude: 25.6866,
  longitude: -100.3161,
  accuracyMeters: 25,
  permissionStatus: 'granted',
  source: 'browser',
  capturedAt: new Date('2026-05-24T12:00:00.000Z').toISOString(),
  ...overrides,
});

const createTenantWithAdmin = async ({ tenantName = 'Acme', email = 'admin@acme.test' } = {}) => {
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
  return { tenant, user };
};

const createSurveyor = async ({ tenant, email = 'surveyor@acme.test' }) =>
  User.create({
    tenantId: tenant._id,
    role: ROLES.SURVEYOR,
    name: 'Field Surveyor',
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });

const publishSurvey = async ({
  tenant,
  user,
  title = 'Field survey',
  slug = 'field-survey',
  status = 'published',
  settings = {},
} = {}) => {
  const survey = await Survey.create({
    tenantId: tenant._id,
    title,
    slug,
    status: 'draft',
    currentDraftSchema: sampleSchema(),
    settings,
    createdBy: user._id,
  });
  const version = await SurveyVersion.create({
    tenantId: tenant._id,
    surveyId: survey._id,
    versionNumber: 1,
    schema: survey.currentDraftSchema,
    settings,
    publishedBy: user._id,
    publishedAt: new Date(),
  });
  survey.status = status;
  survey.publishedVersionId = version._id;
  survey.publishedAt = new Date();
  await survey.save();
  return { survey, version };
};

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

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

describe('surveyor team management', () => {
  it('allows a client admin to create a tenant surveyor account', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    const token = await login(user.email);

    const response = await request(app).post('/api/v1/team/surveyors').set(auth(token)).send({
      name: 'Surveyor One',
      email: 'surveyor.one@acme.test',
      password,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.surveyor).toMatchObject({
      email: 'surveyor.one@acme.test',
      role: ROLES.SURVEYOR,
      tenantId: tenant._id.toString(),
      status: 'active',
    });

    const stored = await User.findOne({ email: 'surveyor.one@acme.test' });
    expect(stored).not.toBeNull();
    expect(stored.role).toBe(ROLES.SURVEYOR);

    const audit = await AuditLog.findOne({ action: TEAM_AUDIT_ACTIONS.SURVEYOR_CREATED });
    expect(audit).not.toBeNull();
    expect(audit.tenantId.toString()).toBe(tenant._id.toString());
  });
});

describe('surveyor survey access', () => {
  it('lists only published surveys from the surveyor tenant', async () => {
    const acme = await createTenantWithAdmin();
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'admin@beta.test',
    });
    const surveyor = await createSurveyor({ tenant: acme.tenant });
    const { survey: acmeSurvey } = await publishSurvey({
      tenant: acme.tenant,
      user: acme.user,
      title: 'Acme published',
      slug: 'acme-published',
    });
    await publishSurvey({
      tenant: acme.tenant,
      user: acme.user,
      title: 'Acme draft',
      slug: 'acme-draft',
      status: 'draft',
    });
    await publishSurvey({
      tenant: beta.tenant,
      user: beta.user,
      title: 'Beta published',
      slug: 'beta-published',
    });

    const token = await login(surveyor.email);
    const response = await request(app).get('/api/v1/surveyor/surveys').set(auth(token));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      id: acmeSurvey._id.toString(),
      title: 'Acme published',
      tenantId: acme.tenant._id.toString(),
      status: 'published',
    });
  });

  it('prevents surveyors from reading another tenant survey by id', async () => {
    const acme = await createTenantWithAdmin();
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'admin@beta.test',
    });
    const surveyor = await createSurveyor({ tenant: acme.tenant });
    const { survey: betaSurvey } = await publishSurvey({
      tenant: beta.tenant,
      user: beta.user,
      slug: 'beta-private',
    });

    const token = await login(surveyor.email);
    const response = await request(app)
      .get(`/api/v1/surveyor/surveys/${betaSurvey._id.toString()}`)
      .set(auth(token));

    expect(response.status).toBe(404);
  });
});

describe('surveyor verified response submission', () => {
  it('submits a verified response while bypassing public-only restrictions', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    const surveyor = await createSurveyor({ tenant });
    const { survey, version } = await publishSurvey({
      tenant,
      user,
      settings: {
        allowAnonymous: false,
        collectIp: true,
        responseLimit: {
          mode: 'one_per_device',
          deviceKeyRequired: true,
          message: 'Already answered.',
        },
        antiAbuse: {
          captcha: { provider: 'turnstile', required: true },
          honeypot: { enabled: true },
        },
      },
    });

    const token = await login(surveyor.email);
    const submit = await request(app)
      .post(`/api/v1/surveyor/surveys/${survey._id.toString()}/responses`)
      .set(auth(token))
      .send({
        answers: [{ fieldId: 'field_name', value: 'Jane Surveyor' }],
        metadata: { location: sampleLocation() },
      });

    expect(submit.status).toBe(201);
    expect(submit.body.data.response).toMatchObject({
      surveyId: survey._id.toString(),
      surveyVersionId: version._id.toString(),
      respondentType: 'surveyor',
      submittedByUserId: surveyor._id.toString(),
    });

    const stored = await Response.findOne({ surveyId: survey._id });
    expect(stored).not.toBeNull();
    expect(stored.respondentType).toBe('surveyor');
    expect(stored.submittedByUserId.toString()).toBe(surveyor._id.toString());
    expect(stored.submissionToken).toBeNull();
    expect(stored.metadata.deviceKeyHash).toBeNull();
    expect(stored.metadata.ipHash).toBeNull();
    expect(stored.answers[0].value).toBe('Jane Surveyor');

    const audit = await AuditLog.findOne({
      action: SURVEYOR_AUDIT_ACTIONS.RESPONSE_SUBMITTED,
    });
    expect(audit).not.toBeNull();
    expect(audit.userId.toString()).toBe(surveyor._id.toString());
  });

  it('still validates required schema fields', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    const surveyor = await createSurveyor({ tenant });
    const { survey } = await publishSurvey({
      tenant,
      user,
      settings: { locationCapture: { minimumAccuracyMeters: 500 } },
    });

    const token = await login(surveyor.email);
    const submit = await request(app)
      .post(`/api/v1/surveyor/surveys/${survey._id.toString()}/responses`)
      .set(auth(token))
      .send({ answers: [], metadata: { location: sampleLocation() } });

    expect(submit.status).toBe(422);
    expect(submit.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('blocks surveyor submission without geolocation server-side', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    const surveyor = await createSurveyor({ tenant });
    const { survey } = await publishSurvey({
      tenant,
      user,
      settings: { locationCapture: { mode: 'disabled' } },
    });

    const token = await login(surveyor.email);
    const submit = await request(app)
      .post(`/api/v1/surveyor/surveys/${survey._id.toString()}/responses`)
      .set(auth(token))
      .send({ answers: [{ fieldId: 'field_name', value: 'Jane Surveyor' }] });

    expect(submit.status).toBe(409);
    expect(submit.body.error.message).toMatch(/Location is required/i);
  });
});

describe('surveyor permission boundaries', () => {
  it('blocks access to management modules', async () => {
    const { tenant } = await createTenantWithAdmin();
    const surveyor = await createSurveyor({ tenant });
    const token = await login(surveyor.email);

    const [surveys, contacts, campaigns, billing, team] = await Promise.all([
      request(app).get('/api/v1/surveys').set(auth(token)),
      request(app).get('/api/v1/contacts').set(auth(token)),
      request(app).get('/api/v1/campaigns').set(auth(token)),
      request(app).get('/api/v1/billing/tokens/balance').set(auth(token)),
      request(app).get('/api/v1/team/members').set(auth(token)),
    ]);

    expect(surveys.status).toBe(403);
    expect(contacts.status).toBe(403);
    expect(campaigns.status).toBe(403);
    expect(billing.status).toBe(403);
    expect(team.status).toBe(403);
  });
});

describe('surveyor fieldwork monitoring', () => {
  const submitSurveyorResponse = async ({ survey, token, value, location = sampleLocation() }) =>
    request(app)
      .post(`/api/v1/surveyor/surveys/${survey._id.toString()}/responses`)
      .set(auth(token))
      .send({
        answers: [{ fieldId: 'field_name', value }],
        metadata: { location },
      });

  it('aggregates surveyor activity, map points, and suspicious location indicators', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    const surveyor = await createSurveyor({ tenant });
    const { survey } = await publishSurvey({
      tenant,
      user,
      settings: { locationCapture: { minimumAccuracyMeters: 500 } },
    });
    const adminToken = await login(user.email);
    const surveyorToken = await login(surveyor.email);

    const ok = await submitSurveyorResponse({
      survey,
      token: surveyorToken,
      value: 'First',
      location: sampleLocation(),
    });
    const lowAccuracy = await submitSurveyorResponse({
      survey,
      token: surveyorToken,
      value: 'Second',
      location: sampleLocation({ latitude: 25.687, accuracyMeters: 250 }),
    });

    expect(ok.status).toBe(201);
    expect(lowAccuracy.status).toBe(201);

    const summary = await request(app)
      .get('/api/v1/surveyor-activity/summary')
      .set(auth(adminToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data.summary.totals.responses).toBe(2);
    expect(summary.body.data.summary.totals.withLocation).toBe(2);
    expect(summary.body.data.summary.totals.lowAccuracy).toBe(1);
    expect(summary.body.data.summary.bySurveyor[0]).toMatchObject({
      surveyorId: surveyor._id.toString(),
      totalResponses: 2,
    });

    const map = await request(app).get('/api/v1/surveyor-activity/map').set(auth(adminToken));
    expect(map.status).toBe(200);
    expect(map.body.data.points).toHaveLength(2);
    expect(map.body.data.points[0]).toHaveProperty('latitude');

    const responses = await request(app)
      .get('/api/v1/surveyor-activity/responses?locationStatus=low_accuracy')
      .set(auth(adminToken));
    expect(responses.status).toBe(200);
    expect(responses.body.data.items).toHaveLength(1);
    expect(responses.body.data.items[0].suspiciousFlags).toContain('low_accuracy');

    const audit = await AuditLog.findOne({
      action: SURVEYOR_ACTIVITY_AUDIT_ACTIONS.LOCATION_VIEWED,
      tenantId: tenant._id,
    });
    expect(audit).not.toBeNull();
  });

  it('rejects surveyor activity access for surveyors and enforces tenant isolation', async () => {
    const acme = await createTenantWithAdmin();
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'admin@beta.test',
    });
    const acmeSurveyor = await createSurveyor({ tenant: acme.tenant });
    const betaSurveyor = await createSurveyor({
      tenant: beta.tenant,
      email: 'surveyor@beta.test',
    });
    const { survey: acmeSurvey } = await publishSurvey({
      tenant: acme.tenant,
      user: acme.user,
      slug: 'acme-monitoring',
    });
    const { survey: betaSurvey } = await publishSurvey({
      tenant: beta.tenant,
      user: beta.user,
      slug: 'beta-monitoring',
    });
    const acmeSurveyorToken = await login(acmeSurveyor.email);
    const betaSurveyorToken = await login(betaSurveyor.email);
    const acmeAdminToken = await login(acme.user.email);

    await submitSurveyorResponse({
      survey: acmeSurvey,
      token: acmeSurveyorToken,
      value: 'Acme',
      location: sampleLocation({ latitude: 25.1 }),
    });
    await submitSurveyorResponse({
      survey: betaSurvey,
      token: betaSurveyorToken,
      value: 'Beta',
      location: sampleLocation({ latitude: 26.1 }),
    });

    const forbidden = await request(app)
      .get('/api/v1/surveyor-activity/summary')
      .set(auth(acmeSurveyorToken));
    expect(forbidden.status).toBe(403);

    const summary = await request(app)
      .get('/api/v1/surveyor-activity/summary')
      .set(auth(acmeAdminToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data.summary.totals.responses).toBe(1);
    expect(summary.body.data.summary.bySurveyor[0].surveyorId).toBe(acmeSurveyor._id.toString());
  });

  it('exports surveyor activity and records an audit event', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    const surveyor = await createSurveyor({ tenant });
    const { survey } = await publishSurvey({ tenant, user });
    const adminToken = await login(user.email);
    const surveyorToken = await login(surveyor.email);

    await submitSurveyorResponse({
      survey,
      token: surveyorToken,
      value: 'Exported',
      location: sampleLocation(),
    });

    const exported = await request(app)
      .get('/api/v1/surveyor-activity/export?format=csv')
      .set(auth(adminToken));

    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.text).toContain('Surveyor name');
    expect(exported.text).toContain('Field Surveyor');

    const audit = await AuditLog.findOne({
      action: SURVEYOR_ACTIVITY_AUDIT_ACTIONS.LOCATION_EXPORTED,
      tenantId: tenant._id,
    });
    expect(audit).not.toBeNull();
  });
});
