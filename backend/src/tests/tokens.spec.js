import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { CampaignRecipient } from '../modules/campaigns/campaign-recipient.model.js';
import { TokenWallet } from '../modules/tokens/token-wallet.model.js';
import { TokenLedgerEntry } from '../modules/tokens/token-ledger-entry.model.js';
import { TokenPackage } from '../modules/tokens/token-package.model.js';
import { ChannelPricingRule } from '../modules/tokens/channel-pricing.model.js';
import { TenantSendLimit } from '../modules/tokens/tenant-send-limit.model.js';
import { TokenPurchase } from '../modules/tokens/token-purchase.model.js';
import { MonthlySendUsage } from '../modules/tokens/monthly-send-usage.model.js';
import { AuditLog } from '../modules/audit/audit-log.model.js';
import * as tokenService from '../modules/tokens/token.service.js';
import { sendCampaign } from '../modules/campaigns/campaign.service.js';
import { Campaign } from '../modules/campaigns/campaign.model.js';
import { loadEnv } from '../config/env.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;
const password = 'StrongPass123!';

const makeTenant = async (name) => {
  return Tenant.create({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
  });
};

const makeUser = async ({ tenant, email, role = ROLES.CLIENT_ADMIN }) => {
  const user = await User.create({
    tenantId: tenant ? tenant._id : null,
    role,
    name: email,
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  if (tenant && !tenant.ownerUserId) {
    tenant.ownerUserId = user._id;
    await tenant.save();
  }
  return user;
};

const login = async (email) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
};

const setWalletBalance = async (tenantId, balance) =>
  TokenWallet.findOneAndUpdate(
    { tenantId },
    { $set: { tenantId, balance } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

const buildPublishedSurvey = async ({ tenantId, ownerId, title = 'Customer survey' }) => {
  const survey = await Survey.create({
    tenantId,
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    status: 'draft',
    currentDraftSchema: {
      fields: [
        {
          id: 'field_rating',
          type: 'rating',
          key: 'rating',
          label: 'Rating',
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

const buildScenario = async ({ tenantName = 'Acme', email = 'acme@test.local' } = {}) => {
  const tenant = await makeTenant(tenantName);
  const user = await makeUser({ tenant, email });
  const { survey } = await buildPublishedSurvey({ tenantId: tenant._id, ownerId: user._id });
  return { tenant, user, survey };
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

describe('Admin: token packages', () => {
  it('rejects client admins from creating packages', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    const token = await login('client@test.local');
    const res = await request(app)
      .post('/api/v1/admin/token-packages')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pro', tokens: 1000, priceMinor: 9900, currency: 'USD' });
    expect(res.status).toBe(403);
  });

  it('lets super admins create, list, update, and toggle packages', async () => {
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    const token = await login('super@test.local');

    const create = await request(app)
      .post('/api/v1/admin/token-packages')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Starter', tokens: 500, priceMinor: 4900, currency: 'USD' });
    expect(create.status).toBe(201);
    const pkgId = create.body.data.package.id;

    const list = await request(app)
      .get('/api/v1/admin/token-packages')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0]).toMatchObject({ name: 'Starter', tokens: 500 });

    const update = await request(app)
      .put(`/api/v1/admin/token-packages/${pkgId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated' });
    expect(update.status).toBe(200);
    expect(update.body.data.package.description).toBe('Updated');

    const status = await request(app)
      .patch(`/api/v1/admin/token-packages/${pkgId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' });
    expect(status.status).toBe(200);
    expect(status.body.data.package.status).toBe('inactive');

    const audit = await AuditLog.find({ entityType: 'token_package' });
    expect(audit.map((a) => a.action)).toContain('tokens.package.created');
    expect(audit.map((a) => a.action)).toContain('tokens.package.status_changed');
  });
});

describe('Admin: channel pricing', () => {
  it('returns defaults when no rule exists and updates per channel', async () => {
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    const token = await login('super@test.local');

    const initial = await request(app)
      .get('/api/v1/admin/channel-pricing')
      .set('Authorization', `Bearer ${token}`);
    expect(initial.status).toBe(200);
    const emailRule = initial.body.data.items.find((r) => r.channel === 'email');
    expect(emailRule.tokensPerRecipient).toBeGreaterThan(0);

    const update = await request(app)
      .put('/api/v1/admin/channel-pricing')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'sms', tokensPerRecipient: 5 });
    expect(update.status).toBe(200);
    expect(update.body.data.rule).toMatchObject({ channel: 'sms', tokensPerRecipient: 5 });

    const rule = await ChannelPricingRule.findOne({ channel: 'sms' });
    expect(rule.tokensPerRecipient).toBe(5);
  });
});

describe('Admin: send limits and adjustments', () => {
  it('updates tenant send limits and persists the audit trail', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    const token = await login('super@test.local');

    const res = await request(app)
      .put(`/api/v1/admin/tenants/${tenant._id.toString()}/send-limits`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        monthlyTotal: 1000,
        monthlyPerChannel: { email: 800, sms: 100, whatsapp: 100 },
        enforcement: 'hard',
        notes: 'tier B',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.limits.monthlyTotal).toBe(1000);

    const persisted = await TenantSendLimit.findOne({ tenantId: tenant._id });
    expect(persisted.monthlyPerChannel.email).toBe(800);

    const audit = await AuditLog.findOne({ action: 'tokens.send_limits.updated' });
    expect(audit).not.toBeNull();
  });

  it('credits and debits a wallet manually and records ledger entries', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    const token = await login('super@test.local');

    const credit = await request(app)
      .post(`/api/v1/admin/tenants/${tenant._id.toString()}/token-adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direction: 'credit', amount: 500, reason: 'goodwill' });
    expect(credit.status).toBe(200);
    expect(credit.body.data.wallet.balance).toBeGreaterThanOrEqual(500);

    const debit = await request(app)
      .post(`/api/v1/admin/tenants/${tenant._id.toString()}/token-adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direction: 'debit', amount: 100, reason: 'correction' });
    expect(debit.status).toBe(200);

    const ledger = await TokenLedgerEntry.find({ tenantId: tenant._id }).sort('createdAt');
    expect(ledger.map((e) => e.type)).toEqual(
      expect.arrayContaining(['adjustment_credit', 'adjustment_debit']),
    );

    const overdraft = await request(app)
      .post(`/api/v1/admin/tenants/${tenant._id.toString()}/token-adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direction: 'debit', amount: 10_000_000, reason: 'too big' });
    expect(overdraft.status).toBe(409);
  });
});

describe('Admin: token purchases approval flow', () => {
  it('approves a pending purchase, credits the wallet, and creates a ledger entry', async () => {
    const tenant = await makeTenant('Acme');
    const clientAdmin = await makeUser({ tenant, email: 'client@test.local' });
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });

    const pkg = await TokenPackage.create({
      name: 'Starter',
      tokens: 200,
      priceMinor: 1000,
      currency: 'USD',
      status: 'active',
    });

    await setWalletBalance(tenant._id, 0);
    const clientToken = await login('client@test.local');
    const requested = await request(app)
      .post('/api/v1/billing/token-purchases')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ packageId: pkg._id.toString() });
    expect(requested.status).toBe(201);
    const purchaseId = requested.body.data.purchase.id;

    const purchase = await TokenPurchase.findById(purchaseId);
    expect(purchase.status).toBe('pending');
    expect(purchase.requestedBy.toString()).toBe(clientAdmin._id.toString());

    const superToken = await login('super@test.local');
    const approval = await request(app)
      .post(`/api/v1/admin/token-purchases/${purchaseId}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ decisionNotes: 'manual approval' });
    expect(approval.status).toBe(200);
    expect(approval.body.data.purchase.status).toBe('completed');
    expect(approval.body.data.wallet.balance).toBe(200);

    const ledger = await TokenLedgerEntry.findOne({ tenantId: tenant._id, type: 'purchase' });
    expect(ledger.amount).toBe(200);
    expect(ledger.balanceAfter).toBe(200);

    // Second approval should fail because the purchase is no longer pending.
    const second = await request(app)
      .post(`/api/v1/admin/token-purchases/${purchaseId}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(second.status).toBe(409);
  });

  it('rejects a pending purchase without crediting the wallet', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });

    const pkg = await TokenPackage.create({
      name: 'Starter',
      tokens: 200,
      priceMinor: 1000,
      currency: 'USD',
      status: 'active',
    });
    await setWalletBalance(tenant._id, 50);
    const clientToken = await login('client@test.local');
    const requested = await request(app)
      .post('/api/v1/billing/token-purchases')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ packageId: pkg._id.toString() });
    expect(requested.status).toBe(201);

    const superToken = await login('super@test.local');
    const rejection = await request(app)
      .post(`/api/v1/admin/token-purchases/${requested.body.data.purchase.id}/reject`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ decisionNotes: 'duplicate' });
    expect(rejection.status).toBe(200);
    expect(rejection.body.data.purchase.status).toBe('rejected');

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(50);
  });
});

describe('Client: billing token routes', () => {
  it('returns balance, pricing, limits, and usage shaped correctly', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    await setWalletBalance(tenant._id, 750);

    const token = await login('client@test.local');
    const res = await request(app)
      .get('/api/v1/billing/tokens/balance')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.wallet.balance).toBe(750);
    expect(res.body.data.pricing).toMatchObject({ email: expect.any(Number) });
    expect(res.body.data.usage).toMatchObject({
      total: 0,
      perChannel: { email: 0, sms: 0, whatsapp: 0 },
    });
  });

  it('returns ledger entries scoped to the calling tenant', async () => {
    const acme = await makeTenant('Acme');
    const beta = await makeTenant('Beta');
    await makeUser({ tenant: acme, email: 'acme@test.local' });
    await makeUser({ tenant: beta, email: 'beta@test.local' });
    await TokenLedgerEntry.create({
      tenantId: acme._id,
      type: 'adjustment_credit',
      amount: 100,
      balanceAfter: 100,
    });
    await TokenLedgerEntry.create({
      tenantId: beta._id,
      type: 'adjustment_credit',
      amount: 100,
      balanceAfter: 100,
    });
    const token = await login('acme@test.local');
    const res = await request(app)
      .get('/api/v1/billing/tokens/ledger')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].tenantId).toBe(acme._id.toString());
  });
});

describe('Campaign sending: token enforcement', () => {
  const createCampaign = async ({ token, surveyId, channels, contactIds }) => {
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Token spec ${Date.now()}`,
        surveyId,
        channels,
        target: { contactIds, groupIds: [] },
      });
    expect(res.status).toBe(201);
    return res.body.data.campaign.id;
  };

  it('blocks the send before any provider call when the balance is insufficient', async () => {
    const { tenant, survey } = await buildScenario();
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Reachable',
      email: 'good@example.com',
      status: 'active',
    });
    await setWalletBalance(tenant._id, 0);
    const token = await login('acme@test.local');
    const contactIds = (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString());
    const campaignId = await createCampaign({
      token,
      surveyId: survey._id.toString(),
      channels: ['email'],
      contactIds,
    });

    const send = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(send.status).toBe(409);
    expect(send.body.error.message).toMatch(/Campaign cannot be sent/);

    const recipients = await CampaignRecipient.find({ campaignId });
    expect(recipients.every((r) => r.status === 'failed')).toBe(true);
    expect(recipients[0].failureReason).toBe('insufficient_balance');

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(0);
  });

  it('debits one token per valid recipient and never charges skipped recipients', async () => {
    const { tenant, survey } = await buildScenario();
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Reachable',
      email: 'reach@example.com',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'No Email',
      phone: '5551112233',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Blocked',
      email: 'blocked@example.com',
      status: 'blocked',
    });
    await setWalletBalance(tenant._id, 10);
    const token = await login('acme@test.local');
    const contactIds = (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString());
    const campaignId = await createCampaign({
      token,
      surveyId: survey._id.toString(),
      channels: ['email'],
      contactIds,
    });

    const sent = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.summary.sentCount).toBe(1);
    expect(sent.body.data.summary.skippedCount).toBe(2);
    expect(sent.body.data.summary.tokensCharged).toBe(1);
    expect(sent.body.data.summary.tokenCost).toBe(1);
    expect(sent.body.data.tokens.balanceAfter).toBe(9);

    const ledger = await TokenLedgerEntry.find({ tenantId: tenant._id });
    expect(ledger.filter((l) => l.type === 'debit')).toHaveLength(1);
    // No refunds and no extra debits for skipped recipients.
    expect(ledger.filter((l) => l.type === 'refund')).toHaveLength(0);
  });

  it('refunds the debit when a provider call fails under the default policy', async () => {
    const { tenant, survey } = await buildScenario();
    // Two contacts: one succeeds, one triggers the mock email provider failure
    // path (the local part contains "fail").
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Good',
      email: 'good@example.com',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Bad',
      email: 'fail@example.com',
      status: 'active',
    });
    await setWalletBalance(tenant._id, 5);
    const token = await login('acme@test.local');
    const contactIds = (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString());
    const campaignId = await createCampaign({
      token,
      surveyId: survey._id.toString(),
      channels: ['email'],
      contactIds,
    });

    const sent = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.summary.sentCount).toBe(1);
    expect(sent.body.data.summary.failedCount).toBe(1);
    expect(sent.body.data.summary.tokensCharged).toBe(2);
    expect(sent.body.data.summary.tokensRefunded).toBe(1);
    expect(sent.body.data.tokens.balanceAfter).toBe(4);

    const ledger = await TokenLedgerEntry.find({ tenantId: tenant._id }).sort('createdAt');
    const types = ledger.map((l) => l.type);
    expect(types.filter((t) => t === 'debit')).toHaveLength(2);
    expect(types.filter((t) => t === 'refund')).toHaveLength(1);

    const refund = ledger.find((l) => l.type === 'refund');
    expect(refund.amount).toBe(1);
    expect(refund.channel).toBe('email');
  });

  it('enforces hard send limits before charging tokens', async () => {
    const { tenant, survey } = await buildScenario();
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Reachable',
      email: 'r1@example.com',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Reachable',
      email: 'r2@example.com',
      status: 'active',
    });
    await setWalletBalance(tenant._id, 100);
    await TenantSendLimit.create({
      tenantId: tenant._id,
      monthlyTotal: 1,
      monthlyPerChannel: { email: null, sms: null, whatsapp: null },
      enforcement: 'hard',
    });
    const token = await login('acme@test.local');
    const contactIds = (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString());
    const campaignId = await createCampaign({
      token,
      surveyId: survey._id.toString(),
      channels: ['email'],
      contactIds,
    });
    const sent = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(409);
    expect(sent.body.error.message).toMatch(/Campaign cannot be sent/);

    const recipients = await CampaignRecipient.find({ campaignId });
    expect(recipients.every((r) => r.status === 'failed')).toBe(true);
    expect(recipients.every((r) => r.failureReason === 'send_limit_exceeded')).toBe(true);

    // No tokens should have been deducted.
    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(100);
  });

  it('increments monthly usage only for successful debits', async () => {
    const { tenant, survey } = await buildScenario();
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Good',
      email: 'good@example.com',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Bad',
      email: 'fail@example.com',
      status: 'active',
    });
    await setWalletBalance(tenant._id, 10);
    const token = await login('acme@test.local');
    const contactIds = (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString());
    const campaignId = await createCampaign({
      token,
      surveyId: survey._id.toString(),
      channels: ['email'],
      contactIds,
    });
    await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);

    const usage = await MonthlySendUsage.findOne({ tenantId: tenant._id });
    // 1 successful send (good) + 1 failed-and-refunded (bad) → net 1 email.
    expect(usage.perChannel.email).toBe(1);
    expect(usage.total).toBe(1);
  });

  it('exposes token totals and remaining balance in the campaign report', async () => {
    const { tenant, survey } = await buildScenario();
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Good',
      email: 'good@example.com',
      status: 'active',
    });
    await setWalletBalance(tenant._id, 5);
    const token = await login('acme@test.local');
    const contactIds = (await Contact.find({ tenantId: tenant._id })).map((c) => c._id.toString());
    const campaignId = await createCampaign({
      token,
      surveyId: survey._id.toString(),
      channels: ['email'],
      contactIds,
    });
    await request(app)
      .post(`/api/v1/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);

    const report = await request(app)
      .get(`/api/v1/campaigns/${campaignId}/report`)
      .set('Authorization', `Bearer ${token}`);
    expect(report.status).toBe(200);
    expect(report.body.data.report.tokens).toMatchObject({
      tokenCost: 1,
      tokensCharged: 1,
      tokensRefunded: 0,
      remainingBalance: 4,
    });
  });
});

describe('Atomic debit under concurrency', () => {
  it('never lets concurrent debit attempts drive the wallet below zero', async () => {
    const tenant = await makeTenant('Concurrent');
    await setWalletBalance(tenant._id, 3);

    const debit = (i) =>
      tokenService.debitForRecipient({
        tenantId: tenant._id,
        recipientId: `00000000000000000000${(100 + i).toString(16)}`.slice(-24),
        campaignId: null,
        channel: 'email',
        tokensPerRecipient: 1,
      });

    const results = await Promise.all([debit(1), debit(2), debit(3), debit(4), debit(5)]);
    const successes = results.filter((r) => r.debited);
    const failures = results.filter((r) => !r.debited);

    expect(successes).toHaveLength(3);
    expect(failures).toHaveLength(2);
    expect(failures.every((f) => f.reason === 'insufficient_balance')).toBe(true);

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(0);

    // Only the successful debits produced ledger entries — the conditional
    // update protects the ledger from drifting against the wallet.
    const ledger = await TokenLedgerEntry.find({ tenantId: tenant._id, type: 'debit' });
    expect(ledger).toHaveLength(3);
    expect(ledger.reduce((sum, entry) => sum + entry.amount, 0)).toBe(3);
  });
});

describe('Failed-send policies other than refund', () => {
  const seedScenarioWithFailure = async () => {
    const { tenant, user, survey } = await buildScenario();
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Good',
      email: 'good@example.com',
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      fullName: 'Bad',
      email: 'fail@example.com',
      status: 'active',
    });
    await setWalletBalance(tenant._id, 5);
    const contacts = await Contact.find({ tenantId: tenant._id });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      surveyId: survey._id,
      surveyVersionId: survey.publishedVersionId,
      name: 'Policy spec',
      channels: ['email'],
      target: { contactIds: contacts.map((c) => c._id), groupIds: [] },
      status: 'draft',
      createdBy: user._id,
    });
    return { tenant, user, campaign };
  };

  it('charges the debit and never refunds when the policy is charge', async () => {
    const { tenant, user, campaign } = await seedScenarioWithFailure();
    const env = { ...loadEnv(), TOKEN_FAILED_SEND_POLICY: 'charge' };

    const result = await sendCampaign({
      id: campaign._id.toString(),
      tenantId: tenant._id,
      actor: { id: user._id.toString(), role: ROLES.CLIENT_ADMIN },
      env,
    });

    expect(result.summary.sentCount).toBe(1);
    expect(result.summary.failedCount).toBe(1);
    expect(result.summary.tokensCharged).toBe(2);
    expect(result.summary.tokensRefunded).toBe(0);
    expect(result.tokens.balanceAfter).toBe(3);

    const refunds = await TokenLedgerEntry.find({ tenantId: tenant._id, type: 'refund' });
    expect(refunds).toHaveLength(0);
  });

  it('holds the debit and surfaces tokensHeld when the policy is hold', async () => {
    const { tenant, user, campaign } = await seedScenarioWithFailure();
    const env = { ...loadEnv(), TOKEN_FAILED_SEND_POLICY: 'hold' };

    const result = await sendCampaign({
      id: campaign._id.toString(),
      tenantId: tenant._id,
      actor: { id: user._id.toString(), role: ROLES.CLIENT_ADMIN },
      env,
    });

    expect(result.summary.tokensCharged).toBe(2);
    expect(result.summary.tokensRefunded).toBe(0);
    expect(result.summary.tokensHeld).toBe(1);
    expect(result.tokens.balanceAfter).toBe(3);

    const refunds = await TokenLedgerEntry.find({ tenantId: tenant._id, type: 'refund' });
    expect(refunds).toHaveLength(0);
  });
});

describe('Role-based access to pricing and send limits', () => {
  it('rejects client users from editing channel pricing', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    const token = await login('client@test.local');
    const res = await request(app)
      .put('/api/v1/admin/channel-pricing')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'email', tokensPerRecipient: 9 });
    expect(res.status).toBe(403);
  });

  it('rejects client users from editing tenant send limits', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    const token = await login('client@test.local');
    const res = await request(app)
      .put(`/api/v1/admin/tenants/${tenant._id.toString()}/send-limits`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        monthlyTotal: 100,
        monthlyPerChannel: { email: null, sms: null, whatsapp: null },
        enforcement: 'hard',
      });
    expect(res.status).toBe(403);
  });

  it('exposes read-only pricing and limits to client billing.view users', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    await setWalletBalance(tenant._id, 25);

    const token = await login('client@test.local');
    const res = await request(app)
      .get('/api/v1/billing/tokens/balance')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pricing).toMatchObject({
      email: expect.any(Number),
      sms: expect.any(Number),
      whatsapp: expect.any(Number),
    });
    expect(res.body.data.limits).toMatchObject({
      monthlyTotal: null,
      monthlyPerChannel: { email: null, sms: null, whatsapp: null },
      enforcement: 'hard',
    });
  });
});
