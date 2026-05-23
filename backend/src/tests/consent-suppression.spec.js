import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { CampaignRecipient } from '../modules/campaigns/campaign-recipient.model.js';
import { SuppressionListEntry } from '../modules/suppression/suppression-list.model.js';
import { createEmailUnsubscribeToken } from '../modules/suppression/suppression.service.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const password = 'StrongPass123!';

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

const buildPublishedSurvey = async ({ tenantId, ownerId, title = 'Customer consent survey' }) => {
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

const sendCampaignForContact = async ({ token, surveyId, contactId, channels = ['email'] }) => {
  const created = await request(app)
    .post('/api/v1/campaigns')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Consent send ${Date.now()}`,
      surveyId: surveyId.toString(),
      channels,
      target: { contactIds: [contactId.toString()] },
    });
  expect(created.status).toBe(201);

  const sent = await request(app)
    .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
    .set('Authorization', `Bearer ${token}`);
  expect(sent.status).toBe(200);
  return sent.body.data;
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

describe('Email unsubscribe and suppression filtering', () => {
  it('unsubscribes with a signed public token and skips future email sends without charging tokens', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const contact = await Contact.create({
      tenantId: tenant._id,
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      status: 'active',
    });
    const token = createEmailUnsubscribeToken({
      tenantId: tenant._id,
      contactId: contact._id,
      email: contact.email,
    });

    const preview = await request(app).get(`/api/v1/public/unsubscribe/email/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.email).toBe('ada@example.com');
    expect(preview.body.data.alreadyUnsubscribed).toBe(false);

    const first = await request(app).post('/api/v1/public/unsubscribe/email').send({ token });
    const second = await request(app).post('/api/v1/public/unsubscribe/email').send({ token });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(
      await SuppressionListEntry.countDocuments({
        tenantId: tenant._id,
        channel: 'email',
        value: 'ada@example.com',
        status: 'active',
      }),
    ).toBe(1);

    const reloaded = await Contact.findById(contact._id);
    expect(reloaded.consent.email.status).toBe('unsubscribed');

    const authToken = await login('acme@test.local');
    const result = await sendCampaignForContact({
      token: authToken,
      surveyId: survey._id,
      contactId: contact._id,
      channels: ['email'],
    });
    expect(result.summary.validCount).toBe(0);
    expect(result.summary.skippedReasons.email_suppressed).toBe(1);
    expect(result.summary.tokensCharged).toBe(0);
  });

  it('keeps manual suppression tenant-scoped and effective after a matching contact is re-created', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });
    const acmeSurvey = await buildPublishedSurvey({
      tenantId: acme.tenant._id,
      ownerId: acme.user._id,
      title: 'Acme survey',
    });
    const betaSurvey = await buildPublishedSurvey({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
      title: 'Beta survey',
    });
    const acmeToken = await login('acme@test.local');
    const betaToken = await login('beta@test.local');

    const createdSuppression = await request(app)
      .post('/api/v1/suppression-list')
      .set('Authorization', `Bearer ${acmeToken}`)
      .send({ channel: 'email', email: 'shared@example.com', reason: 'manual' });
    expect(createdSuppression.status).toBe(201);

    const betaList = await request(app)
      .get('/api/v1/suppression-list')
      .set('Authorization', `Bearer ${betaToken}`);
    expect(betaList.status).toBe(200);
    expect(betaList.body.data.items).toHaveLength(0);

    const acmeContact = await Contact.create({
      tenantId: acme.tenant._id,
      email: 'shared@example.com',
      status: 'active',
    });
    const betaContact = await Contact.create({
      tenantId: beta.tenant._id,
      email: 'shared@example.com',
      status: 'active',
    });

    const acmeResult = await sendCampaignForContact({
      token: acmeToken,
      surveyId: acmeSurvey.survey._id,
      contactId: acmeContact._id,
    });
    expect(acmeResult.summary.skippedReasons.email_suppressed).toBe(1);

    const betaResult = await sendCampaignForContact({
      token: betaToken,
      surveyId: betaSurvey.survey._id,
      contactId: betaContact._id,
    });
    expect(betaResult.summary.sentCount).toBe(1);
    expect(betaResult.summary.skippedCount).toBe(0);
  });
});

describe('Consent validation and protected suppression releases', () => {
  it('skips contacts whose channel consent is not granted', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const contact = await Contact.create({
      tenantId: tenant._id,
      fullName: 'Pending SMS',
      phone: '+15551112222',
      status: 'active',
      consent: {
        sms: { status: 'pending', source: 'manual', changedAt: new Date(), metadata: {} },
      },
    });
    const authToken = await login('acme@test.local');

    const result = await sendCampaignForContact({
      token: authToken,
      surveyId: survey._id,
      contactId: contact._id,
      channels: ['sms'],
    });
    expect(result.summary.validCount).toBe(0);
    expect(result.summary.skippedReasons.sms_consent_missing).toBe(1);
  });

  it('prevents client users from releasing provider/legal suppression entries', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const entry = await SuppressionListEntry.create({
      tenantId: tenant._id,
      channel: 'sms',
      value: '+15551112222',
      phone: '+15551112222',
      reason: 'sms_stop',
      source: 'twilio',
      status: 'active',
    });
    const authToken = await login('acme@test.local');

    const response = await request(app)
      .delete(`/api/v1/suppression-list/${entry._id.toString()}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(response.status).toBe(403);
  });
});

describe('Twilio STOP callbacks', () => {
  it('records STOP idempotently and suppresses future SMS sends for the tenant', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      fullName: 'SMS Contact',
      phone: '+15551112222',
      status: 'active',
    });
    await CampaignRecipient.create({
      tenantId: tenant._id,
      campaignId: new mongoose.Types.ObjectId(),
      surveyId: survey._id,
      surveyVersionId: version._id,
      contactId: contact._id,
      channel: 'sms',
      status: 'sent',
      recipient: '+15551112222',
      submissionToken: 'twilio-stop-token',
      publicUrl: 'http://localhost/f/customer-consent-survey/r/twilio-stop-token',
      provider: 'twilio-sms',
      providerMessageId: 'SM_STOP_1',
      sentAt: new Date(),
    });

    const first = await request(app)
      .post('/api/v1/webhooks/twilio/opt-out')
      .type('form')
      .send({ From: '+15551112222', To: '+15559990000', Body: 'STOP', MessageSid: 'IM_STOP_1' });
    const second = await request(app)
      .post('/api/v1/webhooks/twilio/opt-out')
      .type('form')
      .send({ From: '+15551112222', To: '+15559990000', Body: 'STOP', MessageSid: 'IM_STOP_1' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(
      await SuppressionListEntry.countDocuments({
        tenantId: tenant._id,
        channel: 'sms',
        value: '+15551112222',
        status: 'active',
      }),
    ).toBe(1);

    const reloaded = await Contact.findById(contact._id);
    expect(reloaded.consent.sms.status).toBe('unsubscribed');

    const authToken = await login('acme@test.local');
    const result = await sendCampaignForContact({
      token: authToken,
      surveyId: survey._id,
      contactId: contact._id,
      channels: ['sms'],
    });
    expect(result.summary.skippedReasons.sms_suppressed).toBe(1);
    expect(result.summary.tokensCharged).toBe(0);
  });
});
