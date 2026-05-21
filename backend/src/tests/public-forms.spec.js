import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { Response } from '../modules/responses/response.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const password = 'StrongPass123!';

const sampleField = (overrides = {}) => ({
  id: 'field_name',
  type: 'short_text',
  key: 'name',
  label: 'Your name',
  placeholder: '',
  helpText: '',
  required: true,
  order: 1,
  sectionId: null,
  options: [],
  validation: { minLength: null, maxLength: null, min: null, max: null, regex: null },
  visibility: { mode: 'always', rules: [] },
  settings: { width: 'full', imageUrl: null },
  ...overrides,
});

const sampleSchema = (fields) => ({
  fields: fields ?? [sampleField()],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

const createTenantAndAdmin = async ({ tenantName = 'Acme', email = 'acme@test.local' } = {}) => {
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

const publishSurvey = async ({
  tenant,
  user,
  title = 'Public form',
  slug = 'public-form',
  status = 'published',
  schemaFields,
  settings = {},
}) => {
  const survey = await Survey.create({
    tenantId: tenant._id,
    title,
    slug,
    status: 'draft',
    currentDraftSchema: sampleSchema(schemaFields),
    createdBy: user._id,
    settings,
  });
  const version = await SurveyVersion.create({
    tenantId: tenant._id,
    surveyId: survey._id,
    versionNumber: 1,
    schema: survey.currentDraftSchema,
    publishedBy: user._id,
    publishedAt: new Date(),
  });
  survey.status = status;
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
});

describe('GET /api/v1/public/forms/:slug', () => {
  it('returns the published schema for an active survey', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey, version } = await publishSurvey({ tenant, user, slug: 'feedback' });

    const response = await request(app).get('/api/v1/public/forms/feedback');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.survey.id).toBe(survey._id.toString());
    expect(response.body.data.survey.slug).toBe('feedback');
    expect(response.body.data.acceptingResponses).toBe(true);
    expect(response.body.data.version.id).toBe(version._id.toString());
    expect(response.body.data.version.schema.fields).toHaveLength(1);
  });

  it('does not require authentication', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({ tenant, user, slug: 'anon-ok' });

    const response = await request(app).get('/api/v1/public/forms/anon-ok');
    expect(response.status).toBe(200);
  });

  it('returns 404 when the survey is in draft', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await Survey.create({
      tenantId: tenant._id,
      title: 'Hidden draft',
      slug: 'hidden-draft',
      status: 'draft',
      currentDraftSchema: sampleSchema(),
      createdBy: user._id,
    });

    const response = await request(app).get('/api/v1/public/forms/hidden-draft');
    expect(response.status).toBe(404);
  });

  it('returns 404 when the survey is archived', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey } = await publishSurvey({ tenant, user, slug: 'archived-form' });
    survey.status = 'archived';
    survey.archivedAt = new Date();
    await survey.save();

    const response = await request(app).get('/api/v1/public/forms/archived-form');
    expect(response.status).toBe(404);
  });

  it('exposes paused state and message without leaking acceptance', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey } = await publishSurvey({
      tenant,
      user,
      slug: 'paused-form',
      settings: { pausedMessage: 'Back soon.' },
    });
    survey.status = 'paused';
    await survey.save();

    const response = await request(app).get('/api/v1/public/forms/paused-form');
    expect(response.status).toBe(200);
    expect(response.body.data.survey.status).toBe('paused');
    expect(response.body.data.acceptingResponses).toBe(false);
    expect(response.body.data.pausedMessage).toBe('Back soon.');
  });

  it('never returns the draft schema even when it has diverged', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey, version } = await publishSurvey({ tenant, user, slug: 'versioned' });

    survey.currentDraftSchema = sampleSchema([
      sampleField({ id: 'field_new', key: 'new_field' }),
    ]);
    await survey.save();

    const response = await request(app).get('/api/v1/public/forms/versioned');
    expect(response.status).toBe(200);
    expect(response.body.data.version.id).toBe(version._id.toString());
    expect(response.body.data.version.schema.fields[0].id).toBe('field_name');
  });
});

describe('GET /api/v1/public/forms/:slug/token/:submissionToken', () => {
  it('returns the form metadata with the supplied submission token', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({ tenant, user, slug: 'with-token' });

    const response = await request(app).get(
      '/api/v1/public/forms/with-token/token/abc12345token',
    );
    expect(response.status).toBe(200);
    expect(response.body.data.submissionToken).toBe('abc12345token');
  });

  it('rejects malformed submission tokens', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({ tenant, user, slug: 'with-token-bad' });

    const response = await request(app).get(
      '/api/v1/public/forms/with-token-bad/token/!!!',
    );
    expect(response.status).toBe(422);
  });
});

describe('POST /api/v1/public/forms/:slug/responses', () => {
  it('stores a valid anonymous response against the published version', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey, version } = await publishSurvey({ tenant, user, slug: 'submit-ok' });

    const submit = await request(app)
      .post('/api/v1/public/forms/submit-ok/responses')
      .send({
        answers: [{ fieldId: 'field_name', value: 'Jane Doe' }],
      });
    expect(submit.status).toBe(201);
    expect(submit.body.data.response.surveyId).toBe(survey._id.toString());
    expect(submit.body.data.response.surveyVersionId).toBe(version._id.toString());

    const stored = await Response.findOne({});
    expect(stored).not.toBeNull();
    expect(stored.tenantId.toString()).toBe(tenant._id.toString());
    expect(stored.surveyId.toString()).toBe(survey._id.toString());
    expect(stored.surveyVersionId.toString()).toBe(version._id.toString());
    expect(stored.answers).toHaveLength(1);
    expect(stored.answers[0]).toMatchObject({
      fieldId: 'field_name',
      key: 'name',
      type: 'short_text',
      value: 'Jane Doe',
    });
    expect(stored.metadata.submittedAt).toBeInstanceOf(Date);
  });

  it('rejects submissions that omit a required field', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({ tenant, user, slug: 'missing-required' });

    const submit = await request(app)
      .post('/api/v1/public/forms/missing-required/responses')
      .send({ answers: [] });
    expect(submit.status).toBe(422);
    expect(submit.body.error.code).toBe('VALIDATION_ERROR');
    expect(submit.body.error.details[0].path).toEqual(['answers', 'field_name']);
  });

  it('rejects type-invalid answers', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({
      tenant,
      user,
      slug: 'typed-form',
      schemaFields: [
        sampleField({ id: 'field_email', key: 'email', type: 'email', required: true }),
      ],
    });

    const submit = await request(app)
      .post('/api/v1/public/forms/typed-form/responses')
      .send({ answers: [{ fieldId: 'field_email', value: 'not-an-email' }] });
    expect(submit.status).toBe(422);
    expect(submit.body.error.details[0].message).toMatch(/valid email/i);
  });

  it('rejects submissions when the survey is paused', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey } = await publishSurvey({
      tenant,
      user,
      slug: 'paused-submit',
      settings: { pausedMessage: 'Hold tight.' },
    });
    survey.status = 'paused';
    await survey.save();

    const submit = await request(app)
      .post('/api/v1/public/forms/paused-submit/responses')
      .send({ answers: [{ fieldId: 'field_name', value: 'Pat' }] });
    expect(submit.status).toBe(409);
    expect(submit.body.error.message).toMatch(/hold tight/i);
  });

  it('does not accept submissions on archived surveys', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey } = await publishSurvey({ tenant, user, slug: 'archived-submit' });
    survey.status = 'archived';
    survey.archivedAt = new Date();
    await survey.save();

    const submit = await request(app)
      .post('/api/v1/public/forms/archived-submit/responses')
      .send({ answers: [{ fieldId: 'field_name', value: 'Pat' }] });
    expect(submit.status).toBe(404);
  });

  it('does not store IP when collectIp is false', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({
      tenant,
      user,
      slug: 'no-ip',
      settings: { collectIp: false },
    });

    await request(app)
      .post('/api/v1/public/forms/no-ip/responses')
      .send({ answers: [{ fieldId: 'field_name', value: 'Pat' }] });

    const stored = await Response.findOne({});
    expect(stored?.metadata?.ip).toBeNull();
  });

  it('rejects anonymous submissions when allowAnonymous is false', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({
      tenant,
      user,
      slug: 'no-anon',
      settings: { allowAnonymous: false },
    });

    const submit = await request(app)
      .post('/api/v1/public/forms/no-anon/responses')
      .send({ answers: [{ fieldId: 'field_name', value: 'Pat' }] });
    expect(submit.status).toBe(409);
  });
});
