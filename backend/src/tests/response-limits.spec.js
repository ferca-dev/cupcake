import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { Response } from '../modules/responses/response.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { Campaign } from '../modules/campaigns/campaign.model.js';
import { CampaignRecipient } from '../modules/campaigns/campaign-recipient.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const password = 'StrongPass123!';

const sampleField = () => ({
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
  visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
  settings: { width: 'full', imageUrl: null },
});

const sampleSchema = () => ({
  fields: [sampleField()],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

const createTenantAndAdmin = async () => {
  const tenant = await Tenant.create({
    name: 'Acme',
    slug: 'acme',
    status: 'active',
  });
  const user = await User.create({
    tenantId: tenant._id,
    role: ROLES.CLIENT_ADMIN,
    name: 'Acme Admin',
    email: 'acme@test.local',
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  tenant.ownerUserId = user._id;
  await tenant.save();
  return { tenant, user };
};

const publishSurvey = async ({ tenant, user, slug, settings = {} }) => {
  const survey = await Survey.create({
    tenantId: tenant._id,
    title: 'Limit form',
    slug,
    status: 'draft',
    currentDraftSchema: sampleSchema(),
    createdBy: user._id,
    settings,
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
});

describe('Response limit: one_per_device', () => {
  it('accepts the first submission and rejects a second from the same device key', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({
      tenant,
      user,
      slug: 'device-limit',
      settings: {
        responseLimit: { mode: 'one_per_device' },
      },
    });

    const first = await request(app)
      .post('/api/v1/public/forms/device-limit/responses')
      .send({
        deviceKey: 'device-AB12345678',
        answers: [{ fieldId: 'field_name', value: 'First' }],
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/public/forms/device-limit/responses')
      .send({
        deviceKey: 'device-AB12345678',
        answers: [{ fieldId: 'field_name', value: 'Second' }],
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('RESPONSE_LIMIT_REACHED');
  });

  it('rejects submissions that omit the device key when required', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({
      tenant,
      user,
      slug: 'device-required',
      settings: { responseLimit: { mode: 'one_per_device' } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/device-required/responses')
      .send({ answers: [{ fieldId: 'field_name', value: 'No device' }] });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not collide across surveys even with the same device key', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({
      tenant,
      user,
      slug: 'device-1',
      settings: { responseLimit: { mode: 'one_per_device' } },
    });
    await publishSurvey({
      tenant,
      user,
      slug: 'device-2',
      settings: { responseLimit: { mode: 'one_per_device' } },
    });

    const sharedKey = 'shared-device-1234';
    const a = await request(app)
      .post('/api/v1/public/forms/device-1/responses')
      .send({ deviceKey: sharedKey, answers: [{ fieldId: 'field_name', value: 'A' }] });
    const b = await request(app)
      .post('/api/v1/public/forms/device-2/responses')
      .send({ deviceKey: sharedKey, answers: [{ fieldId: 'field_name', value: 'B' }] });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });
});

describe('Response limit: one_per_ip', () => {
  it('rejects a second submission from the same IP', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    await publishSurvey({
      tenant,
      user,
      slug: 'ip-limit',
      settings: {
        collectIp: true,
        responseLimit: { mode: 'one_per_ip' },
      },
    });

    const first = await request(app)
      .post('/api/v1/public/forms/ip-limit/responses')
      .set('X-Forwarded-For', '203.0.113.55')
      .send({ answers: [{ fieldId: 'field_name', value: 'First' }] });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/public/forms/ip-limit/responses')
      .set('X-Forwarded-For', '203.0.113.55')
      .send({ answers: [{ fieldId: 'field_name', value: 'Second' }] });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('RESPONSE_LIMIT_REACHED');
  });

  it('rejects creation of a survey with one_per_ip and collectIp disabled', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const auth = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password });
    expect(auth.status).toBe(200);

    const create = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${auth.body.data.accessToken}`)
      .send({
        title: 'Bad IP survey',
        slug: 'bad-ip',
        settings: {
          collectIp: false,
          responseLimit: { mode: 'one_per_ip' },
        },
      });
    expect(create.status).toBe(422);
    expect(create.body.error.code).toBe('VALIDATION_ERROR');
    // Silence unused-variable lint for `tenant` since the API path needs none
    expect(tenant).toBeDefined();
  });
});

describe('Response limit: one_per_contact', () => {
  it('rejects a duplicate submission from the same campaign recipient', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey, version } = await publishSurvey({
      tenant,
      user,
      slug: 'contact-limit',
      settings: { responseLimit: { mode: 'one_per_contact' } },
    });

    const contact = await Contact.create({
      tenantId: tenant._id,
      firstName: 'Pat',
      email: 'pat@test.local',
      status: 'active',
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      surveyId: survey._id,
      surveyVersionId: version._id,
      name: 'Once',
      channels: ['email'],
      target: { contactIds: [contact._id], groupIds: [] },
      createdBy: user._id,
      status: 'draft',
    });
    const recipient = await CampaignRecipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      surveyId: survey._id,
      surveyVersionId: version._id,
      contactId: contact._id,
      channel: 'email',
      recipient: contact.email,
      submissionToken: 'token-once-abcdef',
      publicUrl: '/f/contact-limit/r/token-once-abcdef',
      status: 'sent',
    });

    const first = await request(app)
      .post('/api/v1/public/forms/contact-limit/responses')
      .send({
        submissionToken: recipient.submissionToken,
        answers: [{ fieldId: 'field_name', value: 'First' }],
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/public/forms/contact-limit/responses')
      .send({
        submissionToken: recipient.submissionToken,
        answers: [{ fieldId: 'field_name', value: 'Second' }],
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('RESPONSE_LIMIT_REACHED');

    expect(await Response.countDocuments({ surveyId: survey._id })).toBe(1);
  });
});

describe('Response limit snapshotting', () => {
  it('keeps enforcing the published settings even after the live draft changes', async () => {
    const { tenant, user } = await createTenantAndAdmin();
    const { survey } = await publishSurvey({
      tenant,
      user,
      slug: 'snapshot',
      settings: { responseLimit: { mode: 'one_per_device' } },
    });

    // Loosen the draft settings after publish — the rendered public form must
    // still enforce the snapshotted `one_per_device` rule.
    survey.settings.responseLimit = { mode: 'unlimited' };
    survey.markModified('settings');
    await survey.save();

    const first = await request(app)
      .post('/api/v1/public/forms/snapshot/responses')
      .send({
        deviceKey: 'device-snapshot-1234',
        answers: [{ fieldId: 'field_name', value: 'Once' }],
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/public/forms/snapshot/responses')
      .send({
        deviceKey: 'device-snapshot-1234',
        answers: [{ fieldId: 'field_name', value: 'Twice' }],
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('RESPONSE_LIMIT_REACHED');
  });
});
