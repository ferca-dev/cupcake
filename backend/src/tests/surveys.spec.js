import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
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

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

const sampleField = (overrides = {}) => ({
  id: 'field_name',
  type: 'short_text',
  key: 'name',
  label: 'Your name',
  required: true,
  ...overrides,
});

const sampleSchema = (fields = [sampleField()]) => ({
  fields,
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
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

describe('POST /api/v1/surveys', () => {
  it('creates a draft survey scoped to the caller tenant', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'NPS Q4', schema: sampleSchema() });

    expect(response.status).toBe(201);
    expect(response.body.data.survey.title).toBe('NPS Q4');
    expect(response.body.data.survey.status).toBe('draft');
    expect(response.body.data.survey.slug).toMatch(/^nps-q4/);
    expect(response.body.data.survey.tenantId).toBe(tenant._id.toString());
    expect(response.body.data.survey.currentDraftSchema.fields).toHaveLength(1);
  });

  it('auto-generates a unique slug when one already exists', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const first = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Customer feedback' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Customer feedback' });
    expect(second.status).toBe(201);
    expect(second.body.data.survey.slug).not.toBe(first.body.data.survey.slug);
  });

  it('rejects duplicate explicit slugs with a clear conflict', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form one', slug: 'feedback' });

    const conflict = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form two', slug: 'feedback' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('CONFLICT');
  });

  it('rejects invalid form schemas with a validation error', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Bad form',
        schema: {
          fields: [
            sampleField({ id: 'a', key: 'shared' }),
            sampleField({ id: 'b', key: 'shared' }),
          ],
          sections: [],
          logicRules: [],
          layout: { mode: 'single_page', showProgress: true },
        },
      });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unauthenticated callers', async () => {
    const response = await request(app)
      .post('/api/v1/surveys')
      .send({ title: 'Anonymous' });
    expect(response.status).toBe(401);
  });
});

describe('Tenant isolation', () => {
  it('does not return surveys belonging to other tenants', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });

    await Survey.create({
      tenantId: acme.tenant._id,
      title: 'Acme Survey',
      slug: 'acme-survey',
      status: 'draft',
      createdBy: acme.user._id,
      currentDraftSchema: sampleSchema(),
    });
    const betaSurvey = await Survey.create({
      tenantId: beta.tenant._id,
      title: 'Beta Survey',
      slug: 'beta-survey',
      status: 'draft',
      createdBy: beta.user._id,
      currentDraftSchema: sampleSchema(),
    });

    const acmeToken = await login('acme@test.local');

    const list = await request(app)
      .get('/api/v1/surveys')
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].title).toBe('Acme Survey');

    const cross = await request(app)
      .get(`/api/v1/surveys/${betaSurvey._id.toString()}`)
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(cross.status).toBe(404);
  });
});

describe('PUT /api/v1/surveys/:id', () => {
  it('updates the draft schema, title, and settings', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Editable', schema: sampleSchema() });
    const id = created.body.data.survey.id;

    const response = await request(app)
      .put(`/api/v1/surveys/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Edited title',
        settings: { thankYouMessage: 'Thanks!' },
        schema: sampleSchema([
          sampleField(),
          sampleField({ id: 'field_age', key: 'age', type: 'number' }),
        ]),
      });
    expect(response.status).toBe(200);
    expect(response.body.data.survey.title).toBe('Edited title');
    expect(response.body.data.survey.settings.thankYouMessage).toBe('Thanks!');
    expect(response.body.data.survey.currentDraftSchema.fields).toHaveLength(2);
  });

  it('rejects updates to archived surveys', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const survey = await Survey.create({
      tenantId: tenant._id,
      title: 'Old',
      slug: 'old',
      status: 'archived',
      createdBy: user._id,
      currentDraftSchema: sampleSchema(),
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .put(`/api/v1/surveys/${survey._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Should not change' });
    expect(response.status).toBe(409);
  });
});

describe('DELETE /api/v1/surveys/:id', () => {
  it('removes the survey for an authorised client admin', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Disposable' });
    const id = created.body.data.survey.id;

    const response = await request(app)
      .delete(`/api/v1/surveys/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(await Survey.findById(id)).toBeNull();
  });

  it('does not allow members without delete permission', async () => {
    await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'member@test.local',
      role: ROLES.CLIENT_MEMBER,
    });
    const memberToken = await login('member@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ title: 'Member created' });
    const id = created.body.data.survey.id;

    const response = await request(app)
      .delete(`/api/v1/surveys/${id}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(response.status).toBe(403);
  });
});

describe('Lifecycle actions', () => {
  it('publishes a draft and creates an immutable version record', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'To publish', schema: sampleSchema() });
    const id = created.body.data.survey.id;

    const publish = await request(app)
      .post(`/api/v1/surveys/${id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(publish.status).toBe(200);
    expect(publish.body.data.survey.status).toBe('published');
    expect(publish.body.data.survey.publishedVersionId).toEqual(
      publish.body.data.version.id,
    );
    expect(publish.body.data.version.versionNumber).toBe(1);

    const versions = await SurveyVersion.find({ surveyId: id });
    expect(versions).toHaveLength(1);
    expect(versions[0].tenantId.toString()).toBe(tenant._id.toString());
  });

  it('refuses to publish a survey with an empty schema', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Empty' });
    const id = created.body.data.survey.id;

    const publish = await request(app)
      .post(`/api/v1/surveys/${id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(publish.status).toBe(422);
  });

  it('does not mutate prior versions when republishing', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Iterative', schema: sampleSchema() });
    const id = created.body.data.survey.id;

    const firstPublish = await request(app)
      .post(`/api/v1/surveys/${id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(firstPublish.status).toBe(200);
    const firstVersionId = firstPublish.body.data.version.id;
    const firstSchema = firstPublish.body.data.version.schema;

    await request(app)
      .put(`/api/v1/surveys/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        schema: sampleSchema([
          sampleField(),
          sampleField({ id: 'field_age', key: 'age', type: 'number' }),
        ]),
      });

    const secondPublish = await request(app)
      .post(`/api/v1/surveys/${id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondPublish.status).toBe(200);
    expect(secondPublish.body.data.version.versionNumber).toBe(2);

    const originalVersion = await SurveyVersion.findById(firstVersionId);
    expect(originalVersion.schema.fields).toHaveLength(firstSchema.fields.length);
    expect(originalVersion.schema.fields.map((f) => f.id)).toEqual(
      firstSchema.fields.map((f) => f.id),
    );
  });

  it('pauses and archives surveys with the correct transitions', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Lifecycle', schema: sampleSchema() });
    const id = created.body.data.survey.id;

    const pauseDraft = await request(app)
      .post(`/api/v1/surveys/${id}/pause`)
      .set('Authorization', `Bearer ${token}`);
    expect(pauseDraft.status).toBe(409);

    await request(app)
      .post(`/api/v1/surveys/${id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    const pause = await request(app)
      .post(`/api/v1/surveys/${id}/pause`)
      .set('Authorization', `Bearer ${token}`);
    expect(pause.status).toBe(200);
    expect(pause.body.data.survey.status).toBe('paused');

    const archive = await request(app)
      .post(`/api/v1/surveys/${id}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(archive.status).toBe(200);
    expect(archive.body.data.survey.status).toBe('archived');
    expect(archive.body.data.survey.archivedAt).not.toBeNull();
  });

  it('duplicates a survey into a new draft with a unique slug', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Source', slug: 'source', schema: sampleSchema() });
    const id = created.body.data.survey.id;

    const duplicate = await request(app)
      .post(`/api/v1/surveys/${id}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.data.survey.status).toBe('draft');
    expect(duplicate.body.data.survey.slug).not.toBe('source');
    expect(duplicate.body.data.survey.title).toMatch(/copy/i);
    expect(duplicate.body.data.survey.id).not.toBe(id);
  });

  it('returns survey versions in descending version number order', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Versioned', schema: sampleSchema() });
    const id = created.body.data.survey.id;

    await request(app)
      .post(`/api/v1/surveys/${id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/api/v1/surveys/${id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    const versions = await request(app)
      .get(`/api/v1/surveys/${id}/versions`)
      .set('Authorization', `Bearer ${token}`);
    expect(versions.status).toBe(200);
    expect(versions.body.data.versions).toHaveLength(2);
    expect(versions.body.data.versions[0].versionNumber).toBe(2);
    expect(versions.body.data.versions[1].versionNumber).toBe(1);
  });

  it('returns the stats placeholder', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');
    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Stats', schema: sampleSchema() });
    const stats = await request(app)
      .get(`/api/v1/surveys/${created.body.data.survey.id}/stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.stats.placeholder).toBe(true);
    expect(stats.body.data.stats.totalResponses).toBe(0);
  });
});

describe('Audit logging', () => {
  it('records survey lifecycle actions', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Audited', schema: sampleSchema() });
    const id = created.body.data.survey.id;

    await request(app)
      .post(`/api/v1/surveys/${id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    const logs = await AuditLog.find({ tenantId: tenant._id, entityType: 'survey' });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['survey.created', 'survey.published']));
  });
});
