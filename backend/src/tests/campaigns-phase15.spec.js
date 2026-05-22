import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { Campaign } from '../modules/campaigns/campaign.model.js';
import { CampaignRecipient } from '../modules/campaigns/campaign-recipient.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { resolveProviders } from '../modules/campaigns/providers/provider.factory.js';
import { resetEnvCache, loadEnv } from '../config/env.js';

const password = 'StrongPass123!';
let app;

const createTenantWithAdmin = async ({ tenantName, email }) => {
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

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

const buildPublishedSurvey = async ({ tenantId, ownerId, title = 'Customer pulse' }) => {
  const survey = await Survey.create({
    tenantId,
    title,
    description: null,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    status: 'draft',
    currentDraftSchema: {
      fields: [],
      sections: [],
      logicRules: [],
      layout: { mode: 'single_page' },
    },
    settings: {},
    createdBy: ownerId,
  });
  const version = await SurveyVersion.create({
    tenantId,
    surveyId: survey._id,
    versionNumber: 1,
    schema: survey.currentDraftSchema,
    publishedBy: ownerId,
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
  resetEnvCache();
});

describe('Campaign survey locking (Phase 15)', () => {
  it('locks the campaign onto the published version that existed at creation time', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Locked Recipient',
      email: 'locked@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Locked send',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });
    expect(created.status).toBe(201);
    expect(created.body.data.campaign.surveyVersionId).toBe(version._id.toString());

    // Publish a new version after the campaign exists. The campaign should
    // still point at the original version when it sends.
    const newVersion = await SurveyVersion.create({
      tenantId: tenant._id,
      surveyId: survey._id,
      versionNumber: 2,
      schema: { fields: [], sections: [] },
      publishedBy: user._id,
      publishedAt: new Date(),
    });
    survey.publishedVersionId = newVersion._id;
    await survey.save();

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.campaign.surveyVersionId).toBe(version._id.toString());

    const recipient = await CampaignRecipient.findOne({
      campaignId: created.body.data.campaign.id,
      status: 'sent',
    });
    expect(recipient.surveyVersionId.toString()).toBe(version._id.toString());
  });

  it('rejects sending when the survey has been paused', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Paused Recipient',
      email: 'paused@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Paused send',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });
    expect(created.status).toBe(201);

    survey.status = 'paused';
    await survey.save();

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(409);
    expect(sent.body.error.message).toMatch(/paused/i);
  });

  it('rejects sending when the survey has been archived', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Archived Recipient',
      email: 'archived@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Archived send',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });
    expect(created.status).toBe(201);

    survey.status = 'archived';
    survey.archivedAt = new Date();
    await survey.save();

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(409);
  });

  it('rejects sending when the locked survey version no longer exists', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Missing version',
      email: 'mv@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Missing version send',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });
    expect(created.status).toBe(201);

    await SurveyVersion.deleteOne({ _id: version._id });

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(404);
  });

  it('is retry-safe: a second send replaces existing recipients without duplicating', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Retry',
      email: 'retry@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Retry send',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });
    expect(created.status).toBe(201);
    const campaignId = created.body.data.campaign.id;

    const first = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(await CampaignRecipient.countDocuments({ campaignId })).toBe(1);

    // Push the campaign back into a retryable state so we can re-send.
    await Campaign.findByIdAndUpdate(campaignId, { status: 'failed' });

    const retry = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(retry.status).toBe(200);
    expect(await CampaignRecipient.countDocuments({ campaignId })).toBe(1);
  });
});

describe('Provider factory selection (Phase 15)', () => {
  it('returns mock providers by default', () => {
    resetEnvCache();
    const providers = resolveProviders({ env: loadEnv() });
    expect(providers.email.getProviderName()).toBe('mock-email');
    expect(providers.sms.getProviderName()).toBe('mock-sms');
    expect(providers.whatsapp.getProviderName()).toBe('mock-whatsapp');
  });

  it('selects Twilio providers when env vars opt in', () => {
    const env = {
      EMAIL_PROVIDER: 'sendgrid',
      SMS_PROVIDER: 'twilio',
      WHATSAPP_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC_TEST',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_MESSAGING_SERVICE_SID: '',
      TWILIO_SMS_FROM: '+15555550100',
      TWILIO_WHATSAPP_FROM: 'whatsapp:+15555550100',
      TWILIO_STATUS_CALLBACK_URL: '',
      TWILIO_SENDGRID_API_KEY: 'SG.fake',
      TWILIO_SENDGRID_FROM_EMAIL: 'no-reply@cupcake.local',
      TWILIO_SENDGRID_FROM_NAME: 'Cupcake',
    };

    const providers = resolveProviders({ env });
    expect(providers.email.getProviderName()).toBe('twilio-sendgrid-email');
    expect(providers.sms.getProviderName()).toBe('twilio-sms');
    expect(providers.whatsapp.getProviderName()).toBe('twilio-whatsapp');
  });

  it('fails fast when a real Twilio provider is selected without credentials', () => {
    const env = {
      EMAIL_PROVIDER: 'mock',
      SMS_PROVIDER: 'twilio',
      WHATSAPP_PROVIDER: 'mock',
      TWILIO_ACCOUNT_SID: '',
      TWILIO_AUTH_TOKEN: '',
    };
    expect(() => resolveProviders({ env })).toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it('rejects an unknown provider key with a clear error', () => {
    const env = {
      EMAIL_PROVIDER: 'pony-express',
      SMS_PROVIDER: 'mock',
      WHATSAPP_PROVIDER: 'mock',
    };
    expect(() => resolveProviders({ env })).toThrow(/pony-express/);
  });
});

describe('Campaign send uses the selected real providers', () => {
  it('routes the dispatch through the injected provider trio', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Captured Recipient',
      email: 'captured@example.com',
      status: 'active',
    });

    const fakeProvider = {
      getProviderName: () => 'unit-test-email',
      validateRecipient: (contact) => ({
        ready: true,
        reason: null,
        recipient: contact.email,
      }),
      send: vi.fn().mockResolvedValue({
        success: true,
        provider: 'unit-test-email',
        providerMessageId: 'unit-msg-1',
        reason: null,
      }),
    };

    // Drive the service directly so we can swap in a fake provider trio
    // without monkey-patching the factory. This mirrors how a future test
    // could plug Twilio mocks into the same code path.
    const { sendCampaign, createCampaign } =
      await import('../modules/campaigns/campaign.service.js');
    const campaign = await createCampaign({
      tenantId: tenant._id.toString(),
      actor: { id: user._id.toString() },
      payload: {
        name: 'Provider injection',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      },
    });

    const result = await sendCampaign({
      id: campaign.id,
      tenantId: tenant._id.toString(),
      actor: { id: user._id.toString() },
      providers: { email: fakeProvider, sms: fakeProvider, whatsapp: fakeProvider },
    });

    expect(result.summary.sentCount).toBe(1);
    expect(fakeProvider.send).toHaveBeenCalledTimes(1);
    const payload = fakeProvider.send.mock.calls[0][0];
    // Phase 15 requirement: payload must carry survey title, recipient name,
    // and the unique public URL — never private survey data.
    expect(payload.survey.title).toBe('Customer pulse');
    expect(payload.contact.fullName).toBe('Captured Recipient');
    expect(payload.publicUrl).toMatch(/\/f\/customer-pulse\/r\//);

    const recipient = await CampaignRecipient.findOne({ campaignId: campaign.id });
    expect(recipient.provider).toBe('unit-test-email');
    expect(recipient.providerMessageId).toBe('unit-msg-1');
  });

  it('records normalized failure reasons returned by a provider', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Will fail',
      email: 'failure@example.com',
      status: 'active',
    });

    const failingProvider = {
      getProviderName: () => 'unit-test-email',
      validateRecipient: (contact) => ({
        ready: true,
        reason: null,
        recipient: contact.email,
      }),
      send: vi.fn().mockResolvedValue({
        success: false,
        provider: 'unit-test-email',
        providerMessageId: 'unit-msg-fail',
        reason: 'invalid_recipient',
      }),
    };

    const { sendCampaign, createCampaign } =
      await import('../modules/campaigns/campaign.service.js');
    const campaign = await createCampaign({
      tenantId: tenant._id.toString(),
      actor: { id: user._id.toString() },
      payload: {
        name: 'Provider failure',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      },
    });
    const result = await sendCampaign({
      id: campaign.id,
      tenantId: tenant._id.toString(),
      actor: { id: user._id.toString() },
      providers: { email: failingProvider, sms: failingProvider, whatsapp: failingProvider },
    });

    expect(result.summary.failedCount).toBe(1);
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign.id });
    expect(recipient.status).toBe('failed');
    expect(recipient.failureReason).toBe('invalid_recipient');
    expect(recipient.providerMessageId).toBe('unit-msg-fail');
  });
});
