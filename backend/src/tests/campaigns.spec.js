import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { ContactGroup } from '../modules/contacts/contact-group.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { Campaign } from '../modules/campaigns/campaign.model.js';
import { CampaignRecipient } from '../modules/campaigns/campaign-recipient.model.js';
import { Response as SurveyResponse } from '../modules/responses/response.model.js';
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

const buildPublishedSurvey = async ({ tenantId, ownerId, title = 'Customer survey' }) => {
  const survey = await Survey.create({
    tenantId,
    title,
    description: null,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    status: 'draft',
    currentDraftSchema: {
      fields: [
        {
          id: 'field_rating',
          type: 'rating',
          key: 'rating',
          label: 'Rating',
          placeholder: '',
          helpText: '',
          required: true,
          order: 1,
          sectionId: null,
          options: [],
          validation: { minLength: null, maxLength: null, min: 1, max: 5, regex: null },
          visibility: { mode: 'always', rules: [] },
          settings: { width: 'full', imageUrl: null },
        },
      ],
      sections: [],
      logicRules: [],
      layout: { mode: 'single_page', showProgress: true },
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
});

describe('POST /api/v1/campaigns', () => {
  it('creates a campaign for a published survey targeting contacts', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Quarterly survey',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: { contactIds: [contact._id.toString()] },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.campaign.surveyId).toBe(survey._id.toString());
    expect(response.body.data.campaign.summary.selectedCount).toBe(1);
    expect(response.body.data.campaign.status).toBe('draft');
  });

  it('rejects campaigns for unpublished surveys', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const survey = await Survey.create({
      tenantId: tenant._id,
      title: 'Draft only',
      slug: 'draft-only',
      status: 'draft',
      currentDraftSchema: {},
      settings: {},
      createdBy: user._id,
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      email: 'ada@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Quarterly survey',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: { contactIds: [contact._id.toString()] },
      });

    expect(response.status).toBe(409);
  });
});

describe('POST /api/v1/campaigns/:id/send', () => {
  it('sends valid recipients via the mock provider and skips incomplete contacts with reasons', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    const good = await Contact.create({
      tenantId: tenant._id,
      fullName: 'Good Contact',
      email: 'good@example.com',
      status: 'active',
    });
    const missing = await Contact.create({
      tenantId: tenant._id,
      fullName: 'No Email',
      phone: '5551112233',
      status: 'active',
    });
    const blocked = await Contact.create({
      tenantId: tenant._id,
      fullName: 'Blocked Contact',
      email: 'blocked@example.com',
      status: 'blocked',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Email blast',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: [good._id.toString(), missing._id.toString(), blocked._id.toString()],
        },
      });
    expect(created.status).toBe(201);
    const campaignId = created.body.data.campaign.id;

    const sent = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.summary.selectedCount).toBe(3);
    expect(sent.body.data.summary.validCount).toBe(1);
    expect(sent.body.data.summary.sentCount).toBe(1);
    expect(sent.body.data.summary.skippedCount).toBe(2);
    expect(sent.body.data.summary.skippedReasons).toMatchObject({
      missing_email: 1,
      contact_blocked: 1,
    });
    expect(sent.body.data.campaign.status).toBe('completed_with_errors');

    const recipients = await CampaignRecipient.find({ campaignId });
    expect(recipients).toHaveLength(3);
    const byStatus = Object.fromEntries(
      Object.entries(
        recipients.reduce((acc, doc) => {
          acc[doc.status] = (acc[doc.status] ?? 0) + 1;
          return acc;
        }, {}),
      ),
    );
    expect(byStatus).toMatchObject({ sent: 1, skipped: 2 });

    const sentRecipient = recipients.find((r) => r.status === 'sent');
    expect(sentRecipient.submissionToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sentRecipient.publicUrl).toContain('/f/customer-survey/r/');
    expect(sentRecipient.publicUrl).toContain(sentRecipient.submissionToken);
    expect(sentRecipient.provider).toBe('mock-email');
  });

  it('records duplicate recipients as skipped when the same email shows up twice', async () => {
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
      fullName: 'Primary',
      email: 'shared@example.com',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Duplicate',
      email: 'shared@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Email blast',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          groupIds: [],
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });
    expect(created.status).toBe(201);

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.summary.selectedCount).toBe(2);
    expect(sent.body.data.summary.validCount).toBe(1);
    expect(sent.body.data.summary.skippedCount).toBe(1);
    expect(sent.body.data.summary.skippedReasons.duplicate_recipient).toBe(1);
  });

  it('marks provider failures without breaking the rest of the send', async () => {
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
      fullName: 'Working',
      email: 'works@example.com',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Triggers failure',
      // Mock email provider fails when the local part contains "fail".
      email: 'fail@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Email blast',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.summary.sentCount).toBe(1);
    expect(sent.body.data.summary.failedCount).toBe(1);
    expect(sent.body.data.campaign.status).toBe('completed_with_errors');
  });

  it('expands contact groups when sending', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    const group = await ContactGroup.create({ tenantId: tenant._id, name: 'VIPs' });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Group Member',
      email: 'group-member@example.com',
      status: 'active',
      groupIds: [group._id],
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Group blast',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: { contactIds: [], groupIds: [group._id.toString()] },
      });

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.summary.selectedCount).toBe(1);
    expect(sent.body.data.summary.sentCount).toBe(1);
  });
});

describe('GET /api/v1/campaigns/:id/report', () => {
  it('returns aggregated counts matching the recipient records', async () => {
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
      fullName: 'Sendable',
      email: 'sendable@example.com',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'No email',
      phone: '5551112233',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Report blast',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });
    await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);

    const report = await request(app)
      .get(`/api/v1/campaigns/${created.body.data.campaign.id}/report`)
      .set('Authorization', `Bearer ${token}`);
    expect(report.status).toBe(200);
    expect(report.body.data.report.counts.sent).toBe(1);
    expect(report.body.data.report.counts.skipped).toBe(1);
    expect(report.body.data.report.skippedReasons.missing_email).toBe(1);
  });
});

describe('Tenant isolation for campaigns', () => {
  it('refuses to read or send campaigns belonging to a different tenant', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
    });
    const contact = await Contact.create({
      tenantId: beta.tenant._id,
      fullName: 'Beta contact',
      email: 'beta@example.com',
      status: 'active',
    });
    const betaToken = await login('beta@test.local');
    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${betaToken}`)
      .send({
        name: 'Beta blast',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: { contactIds: [contact._id.toString()] },
      });
    expect(created.status).toBe(201);

    const acmeToken = await login('acme@test.local');
    const fetch = await request(app)
      .get(`/api/v1/campaigns/${created.body.data.campaign.id}`)
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(fetch.status).toBe(404);

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(sent.status).toBe(404);

    // No data leak via the list endpoint.
    const list = await request(app)
      .get('/api/v1/campaigns')
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(0);

    expect(acme.tenant._id.toString()).not.toBe(beta.tenant._id.toString());
  });
});

describe('Public submission via campaign token', () => {
  it('links a submitted response to the recipient and flips its status to clicked', async () => {
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
      fullName: 'Engaged',
      email: 'engaged@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Token follow-up',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: {
          contactIds: (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString()),
        },
      });
    await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);

    const recipient = await CampaignRecipient.findOne({
      campaignId: created.body.data.campaign.id,
      status: 'sent',
    });
    expect(recipient).not.toBeNull();

    const submission = await request(app)
      .post(`/api/v1/public/forms/${survey.slug}/responses`)
      .send({
        submissionToken: recipient.submissionToken,
        answers: [{ fieldId: 'field_rating', type: 'rating', value: 5 }],
      });
    expect(submission.status).toBe(201);

    const reloaded = await CampaignRecipient.findById(recipient._id);
    expect(reloaded.status).toBe('clicked');
    expect(reloaded.clickedAt).toBeInstanceOf(Date);

    const linkedResponse = await SurveyResponse.findOne({
      campaignRecipientId: recipient._id,
    });
    expect(linkedResponse).not.toBeNull();
    expect(linkedResponse.campaignId.toString()).toBe(created.body.data.campaign.id);
  });
});

describe('Campaign and CampaignRecipient model state', () => {
  it('keeps token uniqueness across campaigns', async () => {
    // Indexes are built lazily in mongodb-memory-server; force a sync so the
    // unique constraint exists before the duplicate insert.
    await CampaignRecipient.syncIndexes();

    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await buildPublishedSurvey({
      tenantId: tenant._id,
      ownerId: user._id,
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      surveyId: survey._id,
      surveyVersionId: survey.publishedVersionId,
      name: 'Token test',
      channels: ['email'],
      target: { contactIds: [], groupIds: [] },
      status: 'draft',
      createdBy: user._id,
    });
    await CampaignRecipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      surveyId: survey._id,
      surveyVersionId: survey.publishedVersionId,
      channel: 'email',
      recipient: 'a@b.test',
      status: 'pending',
      submissionToken: 'shared-token',
      publicUrl: 'http://localhost/f/x/r/shared-token',
    });
    await expect(
      CampaignRecipient.create({
        tenantId: tenant._id,
        campaignId: campaign._id,
        surveyId: survey._id,
        surveyVersionId: survey.publishedVersionId,
        channel: 'email',
        recipient: 'c@d.test',
        status: 'pending',
        submissionToken: 'shared-token',
        publicUrl: 'http://localhost/f/x/r/shared-token',
      }),
    ).rejects.toThrow();
  });
});
