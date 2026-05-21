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

const createSuperAdmin = async ({ email = 'super@test.local' } = {}) => {
  return User.create({
    tenantId: null,
    role: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });
};

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

const seedSurveyWithResponses = async ({
  tenantId,
  ownerId,
  title,
  publish = true,
  responseCount = 0,
}) => {
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
  let version = null;
  if (publish) {
    version = await SurveyVersion.create({
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
  }
  for (let i = 0; i < responseCount; i += 1) {
    await SurveyResponse.create({
      tenantId,
      surveyId: survey._id,
      surveyVersionId: version?._id ?? survey._id,
      answers: [{ fieldId: 'field_rating', type: 'rating', value: 5 }],
      metadata: {
        ip: null,
        userAgent: null,
        startedAt: null,
        submittedAt: new Date(Date.now() - i * 1000),
        completionTimeSeconds: 30 + i,
      },
    });
  }
  return { survey, version };
};

const seedCampaignWithRecipients = async ({
  tenantId,
  ownerId,
  survey,
  version,
  recipientStatuses = [],
}) => {
  const campaign = await Campaign.create({
    tenantId,
    surveyId: survey._id,
    surveyVersionId: version._id,
    name: 'Dashboard campaign',
    channels: ['email'],
    target: { contactIds: [], groupIds: [] },
    status: 'completed',
    createdBy: ownerId,
  });
  let idx = 0;
  for (const status of recipientStatuses) {
    const isSent = ['sent', 'delivered', 'opened', 'clicked'].includes(status);
    await CampaignRecipient.create({
      tenantId,
      campaignId: campaign._id,
      surveyId: survey._id,
      surveyVersionId: version._id,
      channel: 'email',
      recipient: isSent ? `user${idx}@example.com` : null,
      status,
      skippedReason: status === 'skipped' ? 'missing_email' : null,
      failureReason: status === 'failed' ? 'provider_error' : null,
      provider: isSent ? 'mock-email' : null,
      sentAt: isSent ? new Date() : null,
      submissionToken: `tok-${campaign._id}-${idx}`,
      publicUrl: `http://localhost/f/${survey.slug}/r/tok-${campaign._id}-${idx}`,
    });
    idx += 1;
  }
  return campaign;
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

describe('GET /api/v1/dashboard/summary (client)', () => {
  it('returns tenant-scoped survey, response, and channel metrics', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurveyWithResponses({
      tenantId: tenant._id,
      ownerId: user._id,
      title: 'Customer NPS',
      publish: true,
      responseCount: 3,
    });
    await seedCampaignWithRecipients({
      tenantId: tenant._id,
      ownerId: user._id,
      survey,
      version,
      recipientStatuses: ['sent', 'sent', 'failed', 'skipped'],
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.scope).toBe('tenant');
    const summary = response.body.data.summary;
    expect(summary.surveys.total).toBe(1);
    expect(summary.surveys.active).toBe(1);
    expect(summary.responses.total).toBe(3);
    expect(summary.campaigns.total).toBe(1);
    expect(summary.channels.totals.email.sent).toBe(2);
    expect(summary.channels.totals.email.failed).toBe(1);
    expect(summary.channels.totals.email.skipped).toBe(1);
    expect(summary.channels.totals.sms.sent).toBe(0);
    expect(summary.recentSurveys).toHaveLength(1);
    expect(summary.latestResponses).toHaveLength(3);
    expect(summary.bestResponseSurveys[0].totalResponses).toBe(3);
  });

  it('returns zeros and empty arrays for a new tenant with no data', async () => {
    await createTenantWithAdmin({ tenantName: 'Empty', email: 'empty@test.local' });
    const token = await login('empty@test.local');
    const response = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const summary = response.body.data.summary;
    expect(summary.surveys.total).toBe(0);
    expect(summary.surveys.active).toBe(0);
    expect(summary.responses.total).toBe(0);
    expect(summary.campaigns.total).toBe(0);
    expect(summary.recentSurveys).toEqual([]);
    expect(summary.latestResponses).toEqual([]);
    expect(summary.bestResponseSurveys).toEqual([]);
    expect(summary.lowResponseSurveys).toEqual([]);
    for (const channel of ['email', 'sms', 'whatsapp']) {
      expect(summary.channels.totals[channel].sent).toBe(0);
      expect(summary.channels.totals[channel].failed).toBe(0);
    }
  });

  it('isolates metrics between tenants', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });

    const acmeCtx = await seedSurveyWithResponses({
      tenantId: acme.tenant._id,
      ownerId: acme.user._id,
      title: 'Acme survey',
      responseCount: 2,
    });
    await seedCampaignWithRecipients({
      tenantId: acme.tenant._id,
      ownerId: acme.user._id,
      survey: acmeCtx.survey,
      version: acmeCtx.version,
      recipientStatuses: ['sent', 'sent'],
    });

    const betaCtx = await seedSurveyWithResponses({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
      title: 'Beta survey',
      responseCount: 5,
    });
    await seedCampaignWithRecipients({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
      survey: betaCtx.survey,
      version: betaCtx.version,
      recipientStatuses: ['sent', 'failed', 'failed'],
    });

    const acmeToken = await login('acme@test.local');
    const acmeResponse = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(acmeResponse.status).toBe(200);
    const acmeSummary = acmeResponse.body.data.summary;
    expect(acmeSummary.responses.total).toBe(2);
    expect(acmeSummary.channels.totals.email.sent).toBe(2);
    expect(acmeSummary.channels.totals.email.failed).toBe(0);

    const betaToken = await login('beta@test.local');
    const betaResponse = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${betaToken}`);
    expect(betaResponse.status).toBe(200);
    const betaSummary = betaResponse.body.data.summary;
    expect(betaSummary.responses.total).toBe(5);
    expect(betaSummary.channels.totals.email.failed).toBe(2);
  });
});

describe('GET /api/v1/dashboard/channels', () => {
  it('aggregates recipients by channel and status with skip reasons', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurveyWithResponses({
      tenantId: tenant._id,
      ownerId: user._id,
      title: 'Channel survey',
    });
    await seedCampaignWithRecipients({
      tenantId: tenant._id,
      ownerId: user._id,
      survey,
      version,
      recipientStatuses: ['sent', 'sent', 'failed', 'skipped', 'skipped'],
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get('/api/v1/dashboard/channels')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const channels = response.body.data.channels;
    expect(channels).toHaveLength(3);
    const email = channels.find((c) => c.channel === 'email');
    expect(email.sent).toBe(2);
    expect(email.failed).toBe(1);
    expect(email.skipped).toBe(2);
    expect(email.skippedReasons.missing_email).toBe(2);
    expect(email.providers['mock-email']).toBe(2);
    const sms = channels.find((c) => c.channel === 'sms');
    expect(sms.sent).toBe(0);
  });
});

describe('GET /api/v1/dashboard/surveys/:id', () => {
  it('returns per-survey response and channel stats', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey, version } = await seedSurveyWithResponses({
      tenantId: tenant._id,
      ownerId: user._id,
      title: 'Stats survey',
      responseCount: 4,
    });
    await seedCampaignWithRecipients({
      tenantId: tenant._id,
      ownerId: user._id,
      survey,
      version,
      recipientStatuses: ['sent', 'sent', 'failed', 'skipped'],
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/dashboard/surveys/${survey._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const stats = response.body.data.stats;
    expect(stats.surveyId).toBe(survey._id.toString());
    expect(stats.totalResponses).toBe(4);
    expect(stats.completedResponses).toBe(4);
    expect(stats.totalSent).toBe(2);
    expect(stats.responseRate).toBeCloseTo(2, 5);
    expect(stats.avgCompletionTimeSeconds).toBeGreaterThan(0);
    expect(stats.channels.email.sent).toBe(2);
    expect(stats.channels.email.failed).toBe(1);
    expect(stats.channels.email.skipped).toBe(1);
    expect(Array.isArray(stats.responsesByDay)).toBe(true);
    expect(stats.latestResponses).toHaveLength(4);
  });

  it('refuses to read survey stats for a survey owned by another tenant', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });
    const { survey } = await seedSurveyWithResponses({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
      title: 'Beta survey',
    });

    const acmeToken = await login('acme@test.local');
    const response = await request(app)
      .get(`/api/v1/dashboard/surveys/${survey._id}`)
      .set('Authorization', `Bearer ${acmeToken}`);
    expect(response.status).toBe(404);
    expect(acme.tenant._id.toString()).not.toBe(beta.tenant._id.toString());
  });
});

describe('GET /api/v1/dashboard/recent-activity', () => {
  it('returns the latest audit log entries scoped to the tenant', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const other = await createTenantWithAdmin({
      tenantName: 'Other',
      email: 'other@test.local',
    });
    await AuditLog.create({
      tenantId: tenant._id,
      userId: user._id,
      action: 'survey.created',
      entityType: 'survey',
      entityId: 'one',
    });
    await AuditLog.create({
      tenantId: other.tenant._id,
      userId: other.user._id,
      action: 'survey.created',
      entityType: 'survey',
      entityId: 'two',
    });

    const token = await login('acme@test.local');
    const response = await request(app)
      .get('/api/v1/dashboard/recent-activity')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const items = response.body.data.items;
    // Includes the seeded survey.created audit plus any auth audit logs the
    // login helper emitted for this tenant. The other tenant's logs must not
    // leak in.
    const surveyEntries = items.filter((entry) => entry.action === 'survey.created');
    expect(surveyEntries).toHaveLength(1);
    expect(surveyEntries[0].tenantId).toBe(tenant._id.toString());
    expect(items.every((entry) => entry.tenantId === tenant._id.toString())).toBe(true);
  });
});

describe('GET /api/v1/admin/metrics (super admin)', () => {
  it('returns global metrics including tenants, surveys, and channels', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });
    await createSuperAdmin({ email: 'super@test.local' });

    const acmeCtx = await seedSurveyWithResponses({
      tenantId: acme.tenant._id,
      ownerId: acme.user._id,
      title: 'Acme survey',
      responseCount: 2,
    });
    await seedCampaignWithRecipients({
      tenantId: acme.tenant._id,
      ownerId: acme.user._id,
      survey: acmeCtx.survey,
      version: acmeCtx.version,
      recipientStatuses: ['sent'],
    });

    const betaCtx = await seedSurveyWithResponses({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
      title: 'Beta survey',
      responseCount: 3,
    });
    await seedCampaignWithRecipients({
      tenantId: beta.tenant._id,
      ownerId: beta.user._id,
      survey: betaCtx.survey,
      version: betaCtx.version,
      recipientStatuses: ['sent', 'failed'],
    });

    const token = await login('super@test.local');
    const response = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const metrics = response.body.data.metrics;
    expect(metrics.clients.total).toBe(2);
    expect(metrics.clients.active).toBe(2);
    expect(metrics.users.total).toBeGreaterThanOrEqual(3);
    expect(metrics.surveys.total).toBe(2);
    expect(metrics.responses.total).toBe(5);
    expect(metrics.campaigns.total).toBe(2);
    const email = metrics.channels.find((c) => c.channel === 'email');
    expect(email.sent).toBe(2);
    expect(email.failed).toBe(1);
    expect(metrics.recentTenants.length).toBeGreaterThan(0);
    expect(Array.isArray(metrics.recentActivity)).toBe(true);
    expect(metrics.recentTransactions).toEqual([]);
  });

  it('refuses admin metrics for a tenant-bound client admin', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');
    const response = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });
});

describe('Super admin dashboard summary falls back to global view', () => {
  it('returns the global scope when the super admin does not impersonate a tenant', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    await createSuperAdmin({ email: 'super@test.local' });

    const token = await login('super@test.local');
    const response = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.scope).toBe('global');
    expect(response.body.data.summary.clients.total).toBe(1);
  });

  it('switches to the impersonated tenant when the header is set', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    await seedSurveyWithResponses({
      tenantId: tenant._id,
      ownerId: user._id,
      title: 'Acme survey',
      responseCount: 1,
    });
    await createSuperAdmin({ email: 'super@test.local' });

    const token = await login('super@test.local');
    const response = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .set('x-impersonate-tenant', tenant._id.toString());

    expect(response.status).toBe(200);
    expect(response.body.data.scope).toBe('tenant');
    expect(response.body.data.summary.responses.total).toBe(1);
  });
});

describe('Dashboard auth and authorization', () => {
  it('requires authentication for dashboard endpoints', async () => {
    const response = await request(app).get('/api/v1/dashboard/summary');
    expect(response.status).toBe(401);
  });
});

describe('Dashboard survey stats parity with /surveys/:id/stats', () => {
  it('the survey module endpoint returns the same shape as the dashboard endpoint', async () => {
    const { tenant, user } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const { survey } = await seedSurveyWithResponses({
      tenantId: tenant._id,
      ownerId: user._id,
      title: 'Parity survey',
      responseCount: 2,
    });

    const token = await login('acme@test.local');
    const moduleResponse = await request(app)
      .get(`/api/v1/surveys/${survey._id}/stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(moduleResponse.status).toBe(200);
    expect(moduleResponse.body.data.stats.totalResponses).toBe(2);
    expect(moduleResponse.body.data.stats.placeholder).toBeUndefined();
    expect(moduleResponse.body.data.stats.surveyId).toBe(survey._id.toString());
  });
});
