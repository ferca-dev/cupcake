import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Template } from '../modules/templates/template.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { AuditLog } from '../modules/audit/audit-log.model.js';
import { seedTemplates } from '../seeders/seed-templates.js';
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
  return response.body.data.accessToken;
};

const baseField = (overrides) => ({
  placeholder: '',
  helpText: '',
  required: false,
  sectionId: null,
  options: [],
  validation: { minLength: null, maxLength: null, min: null, max: null, regex: null },
  visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
  settings: { width: 'full', imageUrl: null },
  ...overrides,
});

const sampleSchema = () => ({
  fields: [
    baseField({
      id: 'field_a',
      type: 'short_text',
      key: 'name',
      label: 'Name',
      required: true,
      order: 1,
    }),
    baseField({ id: 'field_b', type: 'long_text', key: 'comments', label: 'Comments', order: 2 }),
  ],
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

describe('GET /api/v1/templates', () => {
  it('returns active system templates plus the caller tenant templates', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { tenant: otherTenant } = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });

    await Template.create({
      tenantId: null,
      title: 'System NPS',
      category: 'nps',
      schema: sampleSchema(),
      isSystemTemplate: true,
      status: 'active',
    });
    await Template.create({
      tenantId: null,
      title: 'Inactive system template',
      category: 'other',
      schema: sampleSchema(),
      isSystemTemplate: true,
      status: 'inactive',
    });
    await Template.create({
      tenantId: tenant._id,
      title: 'Acme private template',
      category: 'other',
      schema: sampleSchema(),
      status: 'active',
    });
    await Template.create({
      tenantId: otherTenant._id,
      title: 'Beta private template',
      category: 'other',
      schema: sampleSchema(),
      status: 'active',
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const titles = response.body.data.items.map((t) => t.title).sort();
    expect(titles).toEqual(['Acme private template', 'System NPS']);
  });

  it('rejects unauthenticated callers', async () => {
    const response = await request(app).get('/api/v1/templates');
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/templates/:id', () => {
  it('returns a 404 when crossing tenant boundaries', async () => {
    const { tenant: betaTenant } = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });
    const betaTemplate = await Template.create({
      tenantId: betaTenant._id,
      title: 'Beta only',
      category: 'other',
      schema: sampleSchema(),
      status: 'active',
    });

    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const response = await request(app)
      .get(`/api/v1/templates/${betaTemplate._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  });

  it('hides inactive system templates from clients', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const template = await Template.create({
      tenantId: null,
      title: 'Hidden',
      category: 'other',
      schema: sampleSchema(),
      isSystemTemplate: true,
      status: 'inactive',
    });

    const response = await request(app)
      .get(`/api/v1/templates/${template._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  });
});

describe('POST /api/v1/templates', () => {
  it('lets a client admin create a tenant template', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Acme onboarding',
        description: 'Internal onboarding form',
        category: 'other',
        schema: sampleSchema(),
      });

    expect(response.status).toBe(201);
    expect(response.body.data.template.tenantId).toBe(tenant._id.toString());
    expect(response.body.data.template.isSystemTemplate).toBe(false);
  });

  it('forbids a tenant admin from setting isSystemTemplate', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sneaky',
        schema: sampleSchema(),
        isSystemTemplate: true,
      });
    expect(response.status).toBe(403);
  });

  it('forbids client members without templates.manage', async () => {
    await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'member@test.local',
      role: ROLES.CLIENT_MEMBER,
    });
    const token = await login('member@test.local');

    const response = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Member', schema: sampleSchema() });
    expect(response.status).toBe(403);
  });

  it('lets a super admin create a system template', async () => {
    await createSuperAdmin({ email: 'super@test.local' });
    const token = await login('super@test.local');

    const response = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'New global template',
        category: 'nps',
        schema: sampleSchema(),
        isSystemTemplate: true,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.template.tenantId).toBeNull();
    expect(response.body.data.template.isSystemTemplate).toBe(true);
  });

  it('rejects invalid form schemas with a 422', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Broken',
        schema: {
          fields: [
            baseField({ id: 'a', type: 'short_text', key: 'shared', label: 'A' }),
            baseField({ id: 'b', type: 'short_text', key: 'shared', label: 'B' }),
          ],
          sections: [],
          logicRules: [],
          layout: { mode: 'single_page', showProgress: true },
        },
      });
    expect(response.status).toBe(422);
  });
});

describe('PUT /api/v1/templates/:id', () => {
  it('blocks tenant users from editing system templates', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const systemTemplate = await Template.create({
      tenantId: null,
      title: 'Global',
      category: 'other',
      schema: sampleSchema(),
      isSystemTemplate: true,
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .put(`/api/v1/templates/${systemTemplate._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Changed' });
    expect(response.status).toBe(403);
  });

  it('lets a tenant admin edit their own template', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const tenantTemplate = await Template.create({
      tenantId: tenant._id,
      title: 'Original',
      category: 'other',
      schema: sampleSchema(),
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .put(`/api/v1/templates/${tenantTemplate._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated title' });
    expect(response.status).toBe(200);
    expect(response.body.data.template.title).toBe('Updated title');
  });
});

describe('DELETE /api/v1/templates/:id', () => {
  it('lets a super admin delete a system template', async () => {
    await createSuperAdmin({ email: 'super@test.local' });
    const systemTemplate = await Template.create({
      tenantId: null,
      title: 'Global',
      category: 'other',
      schema: sampleSchema(),
      isSystemTemplate: true,
      status: 'active',
    });
    const token = await login('super@test.local');

    const response = await request(app)
      .delete(`/api/v1/templates/${systemTemplate._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(await Template.findById(systemTemplate._id)).toBeNull();
  });
});

describe('POST /api/v1/templates/:id/create-survey', () => {
  it('creates a draft survey with a duplicated schema and unique slug', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const template = await Template.create({
      tenantId: null,
      title: 'Customer satisfaction',
      category: 'customer_satisfaction',
      schema: sampleSchema(),
      isSystemTemplate: true,
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post(`/api/v1/templates/${template._id.toString()}/create-survey`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(201);
    const { survey } = response.body.data;
    expect(survey.status).toBe('draft');
    expect(survey.tenantId).toBe(tenant._id.toString());
    expect(survey.title).toBe('Customer satisfaction');
    expect(survey.currentDraftSchema.fields.map((f) => f.id)).toEqual(
      template.schema.fields.map((f) => f.id),
    );

    // Mutate the resulting survey and ensure the template is untouched.
    const storedSurvey = await Survey.findById(survey.id);
    storedSurvey.currentDraftSchema.fields[0].label = 'Mutated';
    storedSurvey.markModified('currentDraftSchema');
    await storedSurvey.save();

    const reloadedTemplate = await Template.findById(template._id);
    expect(reloadedTemplate.schema.fields[0].label).not.toBe('Mutated');
  });

  it('refuses to instantiate inactive templates', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const template = await Template.create({
      tenantId: null,
      title: 'Retired',
      category: 'other',
      schema: sampleSchema(),
      isSystemTemplate: true,
      status: 'inactive',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post(`/api/v1/templates/${template._id.toString()}/create-survey`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    // Inactive system template → not visible to the tenant; the lookup short-
    // circuits with 404 before the inactive-template check runs.
    expect(response.status).toBe(404);
  });

  it('does not let another tenant use a private template', async () => {
    const { tenant: beta } = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });
    const betaTemplate = await Template.create({
      tenantId: beta._id,
      title: 'Beta private',
      category: 'other',
      schema: sampleSchema(),
      status: 'active',
    });

    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post(`/api/v1/templates/${betaTemplate._id.toString()}/create-survey`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(404);
  });

  it('records audit events for template usage and survey creation', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const template = await Template.create({
      tenantId: null,
      title: 'Audit template',
      category: 'other',
      schema: sampleSchema(),
      isSystemTemplate: true,
      status: 'active',
    });
    const token = await login('acme@test.local');

    await request(app)
      .post(`/api/v1/templates/${template._id.toString()}/create-survey`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const templateLogs = await AuditLog.find({ entityType: 'template' });
    const surveyLogs = await AuditLog.find({ entityType: 'survey', tenantId: tenant._id });
    expect(templateLogs.some((l) => l.action === 'template.survey_created')).toBe(true);
    expect(surveyLogs.some((l) => l.action === 'survey.created')).toBe(true);
  });
});

describe('Seeders', () => {
  it('creates at least six system templates and stays idempotent', async () => {
    const first = await seedTemplates();
    expect(first.length).toBeGreaterThanOrEqual(6);
    const titles = first.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);

    await seedTemplates();
    const count = await Template.countDocuments({ tenantId: null });
    expect(count).toBe(first.length);
  });
});
