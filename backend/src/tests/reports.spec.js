import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { Campaign } from '../modules/campaigns/campaign.model.js';
import { CampaignRecipient } from '../modules/campaigns/campaign-recipient.model.js';
import { Response as SurveyResponse } from '../modules/responses/response.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const password = 'StrongPass123!';

const createTenantWithAdmin = async ({ tenantName, email } = {}) => {
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

const SCHEMA_FIELDS = [
  {
    id: 'field_rating',
    type: 'rating',
    key: 'rating',
    label: 'Rate us',
    required: true,
    order: 1,
    sectionId: null,
    options: [],
    validation: { minLength: null, maxLength: null, min: 1, max: 5, regex: null },
    visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
    settings: { width: 'full', imageUrl: null },
  },
  {
    id: 'field_nps',
    type: 'nps',
    key: 'recommend',
    label: 'Would you recommend us?',
    required: false,
    order: 2,
    sectionId: null,
    options: [],
    validation: { minLength: null, maxLength: null, min: 0, max: 10, regex: null },
    visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
    settings: { width: 'full', imageUrl: null },
  },
  {
    id: 'field_color',
    type: 'select',
    key: 'color',
    label: 'Favourite colour',
    required: false,
    order: 3,
    sectionId: null,
    options: [
      { key: 'red', label: 'Red' },
      { key: 'blue', label: 'Blue' },
      { key: 'green', label: 'Green' },
    ],
    validation: {},
    visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
    settings: { width: 'full', imageUrl: null },
  },
  {
    id: 'field_page_break',
    type: 'page_break',
    label: 'Page 2',
    required: false,
    order: 4,
    sectionId: null,
    options: [],
    validation: {},
    visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
    settings: { width: 'full', imageUrl: null },
  },
  {
    id: 'field_comment',
    type: 'long_text',
    key: 'comment',
    label: 'Any comments?',
    required: false,
    order: 5,
    sectionId: null,
    options: [],
    validation: {},
    visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
    settings: { width: 'full', imageUrl: null },
  },
];

const buildSchema = (fields = SCHEMA_FIELDS) => ({
  fields,
  sections: [],
  logicRules: [],
  layout: { mode: 'paginated', showProgress: true },
});

const seedSurvey = async ({ tenantId, ownerId, title = 'Customer feedback' }) => {
  const survey = await Survey.create({
    tenantId,
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    status: 'draft',
    currentDraftSchema: buildSchema(),
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

const createCampaign = async ({ tenantId, ownerId, survey, version, name = 'Campaign A' }) =>
  Campaign.create({
    tenantId,
    surveyId: survey._id,
    surveyVersionId: version._id,
    name,
    channels: ['email'],
    target: { contactIds: [], groupIds: [] },
    status: 'completed',
    createdBy: ownerId,
  });

const createRecipient = async ({
  tenantId,
  campaign,
  survey,
  version,
  channel,
  status,
  skippedReason = null,
}) => {
  const isSent = ['sent', 'delivered', 'opened', 'clicked'].includes(status);
  const recipient = await CampaignRecipient.create({
    tenantId,
    campaignId: campaign._id,
    surveyId: survey._id,
    surveyVersionId: version._id,
    channel,
    recipient: isSent ? `user-${Math.random().toString(36).slice(2, 8)}@test.local` : null,
    status,
    skippedReason,
    provider: isSent ? 'mock' : null,
    sentAt: isSent ? new Date() : null,
    submissionToken: `tok-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    publicUrl: `https://test.local/f/${survey.slug}`,
  });
  return recipient;
};

const createResponse = async ({
  tenantId,
  survey,
  version,
  campaign = null,
  recipient = null,
  answers,
  submittedAt = new Date(),
  completionTimeSeconds = 60,
}) =>
  SurveyResponse.create({
    tenantId,
    surveyId: survey._id,
    surveyVersionId: version._id,
    campaignId: campaign?._id ?? null,
    campaignRecipientId: recipient?._id ?? null,
    answers,
    metadata: {
      ip: null,
      userAgent: null,
      startedAt: null,
      submittedAt,
      completionTimeSeconds,
    },
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

describe('GET /api/v1/surveys/:id/reports/overview', () => {
  it('returns audience, sends, responses, and rate metrics', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const campaign = await createCampaign({
      tenantId: tenant._id,
      ownerId: user._id,
      survey,
      version,
    });

    const recipients = [];
    for (const status of ['sent', 'delivered', 'opened', 'clicked', 'failed', 'skipped']) {
      recipients.push(
        await createRecipient({
          tenantId: tenant._id,
          campaign,
          survey,
          version,
          channel: 'email',
          status,
          skippedReason: status === 'skipped' ? 'missing_email' : null,
        }),
      );
    }

    // 3 responses tied to recipients (campaign channel) + 2 anonymous.
    for (let i = 0; i < 3; i += 1) {
      await createResponse({
        tenantId: tenant._id,
        survey,
        version,
        campaign,
        recipient: recipients[i],
        answers: [
          { fieldId: 'field_rating', key: 'rating', type: 'rating', value: 5 - i },
          { fieldId: 'field_nps', key: 'recommend', type: 'nps', value: 9 - i * 2 },
        ],
        completionTimeSeconds: 30 + i * 10,
      });
    }
    for (let i = 0; i < 2; i += 1) {
      await createResponse({
        tenantId: tenant._id,
        survey,
        version,
        answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 4 }],
        completionTimeSeconds: 90 + i,
      });
    }

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/overview`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const report = response.body.data.report;
    expect(report.surveyId).toBe(survey._id.toString());
    expect(report.totals.totalResponses).toBe(5);
    expect(report.totals.audienceSize).toBe(6);
    expect(report.totals.sentCount).toBe(4); // sent + delivered + opened + clicked
    expect(report.totals.deliveredCount).toBe(3);
    expect(report.totals.openedCount).toBe(2);
    expect(report.totals.clickedCount).toBe(1);
    expect(report.totals.failedCount).toBe(1);
    expect(report.totals.skippedCount).toBe(1);
    expect(report.totals.anonymousResponses).toBe(2);
    expect(report.rates.responseRate).toBeCloseTo(5 / 6, 4);
    expect(report.rates.completionRate).not.toBeNull();
    expect(report.duration.count).toBe(5);
    expect(report.duration.averageSeconds).toBeGreaterThan(0);
    expect(report.duration.minSeconds).toBeLessThanOrEqual(report.duration.maxSeconds);
  });

  it('returns a zero-filled shape for surveys with no data', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Empty',
      email: 'empty@test.local',
    });
    const { survey } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const token = await login('empty@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/overview`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const report = response.body.data.report;
    expect(report.totals.totalResponses).toBe(0);
    expect(report.totals.audienceSize).toBe(0);
    expect(report.rates.responseRate).toBeNull();
    expect(report.duration.count).toBe(0);
    expect(report.duration.averageSeconds).toBeNull();
    expect(report.firstResponseAt).toBeNull();
  });

  it('rejects access to a survey owned by another tenant', async () => {
    const acme = await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const beta = await createTenantWithAdmin({ tenantName: 'Beta', email: 'beta@test.local' });
    const { survey } = await seedSurvey({ tenantId: beta.tenant._id, ownerId: beta.user._id });
    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/overview`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
    expect(acme.tenant._id.toString()).not.toBe(beta.tenant._id.toString());
  });

  it('filters by date range', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 5 }],
      submittedAt: new Date('2026-01-15T12:00:00Z'),
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 3 }],
      submittedAt: new Date('2026-03-20T12:00:00Z'),
    });
    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/overview`)
      .query({ from: '2026-02-01T00:00:00Z', to: '2026-04-01T00:00:00Z' })
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.report.totals.totalResponses).toBe(1);
  });

  it('filters by channel', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const campaign = await createCampaign({
      tenantId: tenant._id,
      ownerId: user._id,
      survey,
      version,
    });
    const emailRecipient = await createRecipient({
      tenantId: tenant._id,
      campaign,
      survey,
      version,
      channel: 'email',
      status: 'sent',
    });
    const smsRecipient = await createRecipient({
      tenantId: tenant._id,
      campaign,
      survey,
      version,
      channel: 'sms',
      status: 'sent',
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      campaign,
      recipient: emailRecipient,
      answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 5 }],
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      campaign,
      recipient: smsRecipient,
      answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 4 }],
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 3 }],
    });
    const token = await login('acme@test.local');

    const emailResp = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/overview`)
      .query({ channel: 'email' })
      .set('Authorization', `Bearer ${token}`);
    expect(emailResp.status).toBe(200);
    expect(emailResp.body.data.report.totals.totalResponses).toBe(1);

    const publicResp = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/overview`)
      .query({ channel: 'public_link' })
      .set('Authorization', `Bearer ${token}`);
    expect(publicResp.status).toBe(200);
    expect(publicResp.body.data.report.totals.totalResponses).toBe(1);
  });
});

describe('GET /api/v1/surveys/:id/reports/channels', () => {
  it('reports per-channel funnel data including the public_link channel', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const campaign = await createCampaign({
      tenantId: tenant._id,
      ownerId: user._id,
      survey,
      version,
    });
    const emailRecipient = await createRecipient({
      tenantId: tenant._id,
      campaign,
      survey,
      version,
      channel: 'email',
      status: 'sent',
    });
    await createRecipient({
      tenantId: tenant._id,
      campaign,
      survey,
      version,
      channel: 'email',
      status: 'delivered',
    });
    await createRecipient({
      tenantId: tenant._id,
      campaign,
      survey,
      version,
      channel: 'email',
      status: 'skipped',
      skippedReason: 'missing_email',
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      campaign,
      recipient: emailRecipient,
      answers: [],
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [],
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/channels`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const channels = response.body.data.report.channels;
    expect(channels).toHaveLength(4);
    const email = channels.find((c) => c.channel === 'email');
    expect(email.attempted).toBe(3);
    expect(email.sent).toBe(2);
    expect(email.delivered).toBe(1);
    expect(email.skipped).toBe(1);
    expect(email.skippedReasons.missing_email).toBe(1);
    expect(email.responses).toBe(1);

    const publicLink = channels.find((c) => c.channel === 'public_link');
    expect(publicLink.responses).toBe(1);
    expect(publicLink.sent).toBe(0);
  });
});

describe('GET /api/v1/surveys/:id/reports/questions', () => {
  it('returns per-question distributions, numeric summaries, and NPS metrics', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });

    const ratings = [5, 4, 5, 3, 2];
    const npsScores = [9, 10, 10, 7, 4];
    const colors = ['red', 'blue', 'red', 'green', 'blue'];
    for (let i = 0; i < ratings.length; i += 1) {
      await createResponse({
        tenantId: tenant._id,
        survey,
        version,
        answers: [
          { fieldId: 'field_rating', key: 'rating', type: 'rating', value: ratings[i] },
          { fieldId: 'field_nps', key: 'recommend', type: 'nps', value: npsScores[i] },
          { fieldId: 'field_color', key: 'color', type: 'select', value: colors[i] },
        ],
      });
    }

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/questions`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const report = response.body.data.report;
    expect(report.totalResponses).toBe(5);

    const ratingQ = report.questions.find((q) => q.fieldId === 'field_rating');
    expect(ratingQ.responseCount).toBe(5);
    expect(ratingQ.numericSummary.average).toBeCloseTo(3.8, 2);
    expect(ratingQ.rating.min).toBe(2);
    expect(ratingQ.rating.max).toBe(5);

    const npsQ = report.questions.find((q) => q.fieldId === 'field_nps');
    expect(npsQ.nps.promoters).toBe(3); // 9, 10, 10
    expect(npsQ.nps.passives).toBe(1); // 7
    expect(npsQ.nps.detractors).toBe(1); // 4
    // (3 - 1) / 5 = 0.4 → 40
    expect(npsQ.nps.score).toBe(40);

    const colorQ = report.questions.find((q) => q.fieldId === 'field_color');
    const red = colorQ.distribution.find((d) => d.value === 'red');
    expect(red.count).toBe(2);
    expect(colorQ.distribution.find((d) => d.value === 'blue').count).toBe(2);
    expect(colorQ.distribution.find((d) => d.value === 'green').count).toBe(1);

    // The page break is presentational; long_text field has no answers so it
    // appears with zero counts.
    const commentQ = report.questions.find((q) => q.fieldId === 'field_comment');
    expect(commentQ.responseCount).toBe(0);
    expect(commentQ.skipCount).toBe(5);
  });

  it('labels answers using the requested historical version schema', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });

    // Publish a second version that drops `field_color` so the default
    // resolution would mis-label the historical answers.
    const v2Fields = SCHEMA_FIELDS.filter((f) => f.id !== 'field_color');
    const v2 = await SurveyVersion.create({
      tenantId: tenant._id,
      surveyId: survey._id,
      versionNumber: 2,
      schema: {
        fields: v2Fields,
        sections: [],
        logicRules: [],
        layout: { mode: 'single_page', showProgress: true },
      },
      publishedBy: user._id,
      publishedAt: new Date(),
    });
    survey.publishedVersionId = v2._id;
    await survey.save();

    // Old response references v1 and includes field_color.
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [
        { fieldId: 'field_rating', key: 'rating', type: 'rating', value: 5 },
        { fieldId: 'field_color', key: 'color', type: 'select', value: 'red' },
      ],
    });

    const token = await login('acme@test.local');
    const defaultResp = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/questions`)
      .set('Authorization', `Bearer ${token}`);
    // Default version is v2 — field_color appears as the synthetic
    // out-of-schema entry, not the v2 schema.
    expect(defaultResp.body.data.report.surveyVersion.versionNumber).toBe(2);
    const colorInDefault = defaultResp.body.data.report.questions.find(
      (q) => q.fieldId === 'field_color',
    );
    expect(colorInDefault.responseCount).toBe(1);

    // Asking for v1 should label color from the v1 options.
    const versionedResp = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/questions`)
      .query({ surveyVersionId: version._id.toString() })
      .set('Authorization', `Bearer ${token}`);
    expect(versionedResp.status).toBe(200);
    expect(versionedResp.body.data.report.surveyVersion.versionNumber).toBe(1);
    const v1Color = versionedResp.body.data.report.questions.find(
      (q) => q.fieldId === 'field_color',
    );
    const red = v1Color.distribution.find((d) => d.value === 'red');
    expect(red.label).toBe('Red');
  });
});

describe('GET /api/v1/surveys/:id/reports/trends', () => {
  it('groups responses by day and channel', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const campaign = await createCampaign({
      tenantId: tenant._id,
      ownerId: user._id,
      survey,
      version,
    });
    const emailRecipient = await createRecipient({
      tenantId: tenant._id,
      campaign,
      survey,
      version,
      channel: 'email',
      status: 'sent',
    });

    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      campaign,
      recipient: emailRecipient,
      answers: [],
      submittedAt: new Date('2026-05-01T08:00:00Z'),
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [],
      submittedAt: new Date('2026-05-01T18:30:00Z'),
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [],
      submittedAt: new Date('2026-05-02T11:00:00Z'),
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/trends`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const report = response.body.data.report;
    expect(report.byDay).toHaveLength(2);
    const day1 = report.byDay.find((d) => d.date === '2026-05-01');
    expect(day1.total).toBe(2);
    expect(day1.channels.email).toBe(1);
    expect(day1.channels.public_link).toBe(1);
  });
});

describe('GET /api/v1/surveys/:id/reports/drop-off', () => {
  it('reports per-page reach counts using the schema page breaks', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });

    // Three respondents finish page 1; one of them also fills the page 2
    // long_text field. The drop-off should reflect 3 → 1 between pages.
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 5 }],
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 4 }],
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [
        { fieldId: 'field_rating', key: 'rating', type: 'rating', value: 3 },
        { fieldId: 'field_comment', key: 'comment', type: 'long_text', value: 'Good' },
      ],
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/drop-off`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const report = response.body.data.report;
    expect(report.totalResponses).toBe(3);
    expect(report.pages).toHaveLength(2);
    expect(report.pages[0].reached).toBe(3);
    expect(report.pages[1].reached).toBe(1);
    expect(report.pages[1].dropRateFromPrevious).toBeCloseTo(2 / 3, 4);

    const ratingField = report.fields.find((f) => f.fieldId === 'field_rating');
    expect(ratingField.reached).toBe(3);
    const commentField = report.fields.find((f) => f.fieldId === 'field_comment');
    expect(commentField.reached).toBe(1);
  });
});

describe('GET /api/v1/surveys/:id/reports/timing', () => {
  it('returns duration buckets and aggregate stats', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });

    const durations = [10, 45, 90, 150, 250];
    for (let i = 0; i < durations.length; i += 1) {
      await createResponse({
        tenantId: tenant._id,
        survey,
        version,
        answers: [],
        completionTimeSeconds: durations[i],
        submittedAt: new Date(`2026-05-${10 + i}T12:00:00Z`),
      });
    }

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/timing`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const report = response.body.data.report;
    expect(report.duration.count).toBe(5);
    expect(report.duration.minSeconds).toBe(10);
    expect(report.duration.maxSeconds).toBe(250);
    expect(report.duration.medianSeconds).toBe(90);
    expect(report.distribution).toHaveLength(6);
    const firstBucket = report.distribution.find((b) => b.label === '0-30s');
    expect(firstBucket.count).toBe(1);
  });
});

describe('GET /api/v1/surveys/:id/reports/versions', () => {
  it('lists versions with response counts and current-published flag', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const v2 = await SurveyVersion.create({
      tenantId: tenant._id,
      surveyId: survey._id,
      versionNumber: 2,
      schema: survey.currentDraftSchema,
      publishedBy: user._id,
      publishedAt: new Date(),
    });
    survey.publishedVersionId = v2._id;
    await survey.save();

    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [],
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version: v2,
      answers: [],
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version: v2,
      answers: [],
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/versions`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const versions = response.body.data.report.versions;
    expect(versions).toHaveLength(2);
    const v2Out = versions.find((v) => v.versionNumber === 2);
    expect(v2Out.responseCount).toBe(2);
    expect(v2Out.isCurrentlyPublished).toBe(true);
    const v1Out = versions.find((v) => v.versionNumber === 1);
    expect(v1Out.responseCount).toBe(1);
    expect(v1Out.isCurrentlyPublished).toBe(false);
  });
});

describe('GET /api/v1/surveys/:id/reports/export', () => {
  it('streams a CSV containing one row per response and a column per schema field', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [
        { fieldId: 'field_rating', key: 'rating', type: 'rating', value: 5 },
        { fieldId: 'field_color', key: 'color', type: 'select', value: 'red' },
      ],
    });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [
        { fieldId: 'field_rating', key: 'rating', type: 'rating', value: 3 },
        { fieldId: 'field_comment', key: 'comment', type: 'long_text', value: 'Hi, "all" good\n' },
      ],
    });
    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/export`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.headers['content-disposition']).toMatch(/attachment/);
    const body = response.text;
    expect(body.split('\r\n')[0]).toContain('Response ID');
    expect(body).toContain('red');
    // Cells containing newlines or quotes must be quoted; the double-quote
    // inside the comment should be escaped as "" per RFC-4180.
    expect(body).toMatch(/"Hi, ""all"" good/);
  });

  it('returns a JSON aggregate when type=questions and format=json', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    await createResponse({
      tenantId: tenant._id,
      survey,
      version,
      answers: [{ fieldId: 'field_color', key: 'color', type: 'select', value: 'blue' }],
    });
    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/export`)
      .query({ type: 'questions', format: 'json' })
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    const parsed = JSON.parse(response.text);
    expect(Array.isArray(parsed.rows)).toBe(true);
    const blueRow = parsed.rows.find((row) => row.optionValue === 'blue');
    expect(blueRow.optionCount).toBe(1);
  });

  it('refuses to export responses for a survey owned by another tenant', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const beta = await createTenantWithAdmin({ tenantName: 'Beta', email: 'beta@test.local' });
    const { survey, version } = await seedSurvey({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
    });
    await createResponse({
      tenantId: beta.tenant._id,
      survey,
      version,
      answers: [{ fieldId: 'field_rating', key: 'rating', type: 'rating', value: 4 }],
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/export`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
    // The body must not leak the other tenant's CSV header or rows.
    expect(response.text || '').not.toMatch(/Response ID/);
  });

  it('refuses to export questions JSON for a survey owned by another tenant', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const beta = await createTenantWithAdmin({ tenantName: 'Beta', email: 'beta@test.local' });
    const { survey, version } = await seedSurvey({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
    });
    await createResponse({
      tenantId: beta.tenant._id,
      survey,
      version,
      answers: [{ fieldId: 'field_color', key: 'color', type: 'select', value: 'red' }],
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/surveys/${survey._id}/reports/export`)
      .query({ type: 'questions', format: 'json' })
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  });
});

describe('Report endpoints auth', () => {
  it('rejects unauthenticated requests', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await seedSurvey({ tenantId: tenant._id, ownerId: user._id });
    const response = await request(app).get(`/api/v1/surveys/${survey._id}/reports/overview`);
    expect(response.status).toBe(401);
  });
});
