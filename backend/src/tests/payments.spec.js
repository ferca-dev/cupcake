import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { TokenPackage } from '../modules/tokens/token-package.model.js';
import { TokenWallet } from '../modules/tokens/token-wallet.model.js';
import { TokenLedgerEntry } from '../modules/tokens/token-ledger-entry.model.js';
import { PaymentTransaction } from '../modules/payments/payment-transaction.model.js';
import { PaymentWebhookEvent } from '../modules/payments/payment-webhook-event.model.js';
import { PaymentNotification } from '../modules/payments/payment-notification.model.js';
import { SubscriptionPlan } from '../modules/payments/subscription-plan.model.js';
import { TenantSubscription } from '../modules/payments/tenant-subscription.model.js';
import { SubscriptionInvoice } from '../modules/payments/subscription-invoice.model.js';
import {
  resetPaymentProvider,
  setPaymentProvider,
} from '../modules/payments/providers/provider.factory.js';
import { createMockPaymentProvider } from '../modules/payments/providers/mock-payment.provider.js';
import * as subscriptionService from '../modules/payments/subscription.service.js';
import * as reminders from '../modules/payments/reminders.service.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { loadEnv, resetEnvCache } from '../config/env.js';

let app;
const password = 'StrongPass123!';
let savedDefaultBalance;

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

const createPackage = (overrides = {}) =>
  TokenPackage.create({
    name: 'Pro pack',
    tokens: 1000,
    priceMinor: 9900,
    currency: 'USD',
    status: 'active',
    ...overrides,
  });

/**
 * Build a test mock provider and install it as the active payment provider so
 * `resolvePaymentProvider()` returns it. Returns the provider so tests can
 * inspect the in-memory bookkeeping or override scripted states.
 */
const installMockProvider = () => {
  const provider = createMockPaymentProvider({ env: loadEnv() });
  setPaymentProvider(provider, 'mock');
  return provider;
};

const scriptApprovedPayment = (provider, transaction, paymentId = 'mp_pay_1') => {
  provider._setPaymentState(paymentId, {
    status: 'approved',
    rawStatus: 'approved',
    externalReference: transaction.externalReference,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    payerEmail: 'payer@example.com',
    preferenceId: transaction.providerPreferenceId,
    paidAt: new Date().toISOString(),
    raw: { mock: true },
  });
};

beforeAll(async () => {
  // The shared test setup keeps DEFAULT_TOKEN_BALANCE high to grandfather
  // older campaign specs. Payment tests assert wallet balances after credits,
  // so we drop it to 0 for this suite and restore on tear-down.
  savedDefaultBalance = process.env.DEFAULT_TOKEN_BALANCE;
  process.env.DEFAULT_TOKEN_BALANCE = '0';
  resetEnvCache();
  await startInMemoryMongo();
  app = createApp();
});

afterAll(async () => {
  await stopInMemoryMongo();
  if (savedDefaultBalance !== undefined) {
    process.env.DEFAULT_TOKEN_BALANCE = savedDefaultBalance;
  }
  resetEnvCache();
});

beforeEach(async () => {
  await clearCollections();
  resetPaymentProvider();
});

// ---------------------------------------------------------------------
// Preference creation
// ---------------------------------------------------------------------

describe('POST /api/v1/billing/mercadopago/preferences', () => {
  it('creates a pending payment transaction and returns the checkout init point', async () => {
    installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const pkg = await createPackage();
    const token = await login('acme@test.local');

    const res = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: pkg._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.preference.initPoint).toMatch(/mock-checkout/);
    expect(res.body.data.preference.externalReference).toMatch(/^cupcake_tokens_/);
    expect(res.body.data.transaction.status).toBe('pending');
    expect(res.body.data.transaction.tokensToCredit).toBe(pkg.tokens);

    // No tokens credited until webhook confirmation.
    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet?.balance ?? 0).toBe(0);

    // Pending notification recorded under the deterministic key.
    const pending = await PaymentNotification.findOne({ type: 'token_payment_pending' });
    expect(pending).not.toBeNull();
    expect(pending.idempotencyKey).toMatch(/^token_payment_pending:/);
  });

  it('rejects an unknown package id', async () => {
    installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const res = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(404);
  });

  it('rejects client-supplied payment mutation fields', async () => {
    installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const pkg = await createPackage({ tokens: 1000, priceMinor: 9900 });
    const token = await login('acme@test.local');

    const res = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        packageId: pkg._id.toString(),
        tokensToCredit: 500000,
        amountMinor: 1,
        status: 'approved',
      });

    expect(res.status).toBe(422);
    expect(await PaymentTransaction.countDocuments()).toBe(0);
  });

  it('refuses to be called by a client without billing.view permission', async () => {
    installMockProvider();
    const tenant = await makeTenant('Acme');
    // CLIENT_MEMBER does not have billing.view.
    await makeUser({ tenant, email: 'member@test.local', role: ROLES.CLIENT_MEMBER });
    const pkg = await createPackage();
    const token = await login('member@test.local');

    const res = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: pkg._id.toString() });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------

describe('Mercado Pago webhook processing', () => {
  it('credits the wallet exactly once even when the same webhook arrives twice', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const pkg = await createPackage({ tokens: 500, priceMinor: 1000 });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: pkg._id.toString() });
    expect(created.status).toBe(201);

    const transaction = await PaymentTransaction.findById(created.body.data.transaction.id);
    scriptApprovedPayment(provider, transaction, 'mp_pay_credit_once');

    const webhookBody = { id: 'event-1', type: 'payment', data: { id: 'mp_pay_credit_once' } };
    const first = await request(app).post('/api/v1/webhooks/mercadopago').send(webhookBody);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('processed');

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(500);

    const ledger = await TokenLedgerEntry.find({ tenantId: tenant._id });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('purchase');
    expect(ledger[0].amount).toBe(500);

    // Replay — same event id, same payment id. Should NOT credit again.
    const replay = await request(app).post('/api/v1/webhooks/mercadopago').send(webhookBody);
    expect(replay.status).toBe(200);
    expect(replay.body.data.status).toBe('duplicate');

    const walletAgain = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(walletAgain.balance).toBe(500);
    const ledgerAgain = await TokenLedgerEntry.find({ tenantId: tenant._id });
    expect(ledgerAgain).toHaveLength(1);
  });

  it('does not duplicate token credits, ledger entries, or emails across distinct events for the same payment', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const pkg = await createPackage({ tokens: 250, priceMinor: 1000 });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: pkg._id.toString() });
    const transaction = await PaymentTransaction.findById(created.body.data.transaction.id);
    scriptApprovedPayment(provider, transaction, 'mp_pay_same_payment');

    const first = await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({ id: 'event-same-payment-1', type: 'payment', data: { id: 'mp_pay_same_payment' } });
    expect(first.body.data.status).toBe('processed');

    const second = await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({ id: 'event-same-payment-2', type: 'payment', data: { id: 'mp_pay_same_payment' } });
    expect(second.body.data.status).toBe('processed');

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(250);
    expect(await TokenLedgerEntry.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(await PaymentNotification.countDocuments({ type: 'token_payment_approved' })).toBe(1);
  });

  it('does not credit tokens for rejected, pending, or cancelled statuses', async () => {
    const provider = installMockProvider();
    for (const status of ['rejected', 'pending', 'cancelled']) {
      await clearCollections();
      // Re-create the actor + package after the per-iteration clear.
      const tenant2 = await makeTenant(`Tenant ${status}`);
      await makeUser({ tenant: tenant2, email: `${status}@test.local` });
      const pkg2 = await createPackage({ tokens: 200 });
      const t2 = await login(`${status}@test.local`);
      const created = await request(app)
        .post('/api/v1/billing/mercadopago/preferences')
        .set('Authorization', `Bearer ${t2}`)
        .send({ packageId: pkg2._id.toString() });
      const tx = await PaymentTransaction.findById(created.body.data.transaction.id);

      provider._setPaymentState(`pay_${status}`, {
        status,
        rawStatus: status,
        externalReference: tx.externalReference,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        payerEmail: 'payer@example.com',
        preferenceId: tx.providerPreferenceId,
        paidAt: null,
        raw: { mock: true },
      });

      const res = await request(app)
        .post('/api/v1/webhooks/mercadopago')
        .send({ id: `event-${status}`, type: 'payment', data: { id: `pay_${status}` } });
      expect(res.status).toBe(200);

      const wallet = await TokenWallet.findOne({ tenantId: tenant2._id });
      expect(wallet?.balance ?? 0).toBe(0);
    }
  });

  it('creates one traceable token reversal when a refund event arrives', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const pkg = await createPackage({ tokens: 300 });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: pkg._id.toString() });
    const tx = await PaymentTransaction.findById(created.body.data.transaction.id);

    scriptApprovedPayment(provider, tx, 'pay_refund_flow');
    await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({ id: 'event-approve', type: 'payment', data: { id: 'pay_refund_flow' } });

    // Now the same payment id transitions to refunded.
    provider._setPaymentState('pay_refund_flow', {
      status: 'refunded',
      rawStatus: 'refunded',
      externalReference: tx.externalReference,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      payerEmail: 'payer@example.com',
      preferenceId: tx.providerPreferenceId,
      paidAt: new Date().toISOString(),
      raw: { mock: true },
    });
    const refundRes = await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({ id: 'event-refund', type: 'payment', data: { id: 'pay_refund_flow' } });
    expect(refundRes.status).toBe(200);

    const reloaded = await PaymentTransaction.findById(tx._id);
    expect(reloaded.status).toBe('refunded');
    expect(reloaded.refundedAt).toBeInstanceOf(Date);
    expect(reloaded.tokenReversed).toBe(true);
    expect(reloaded.tokenReversalLedgerEntryId).toBeTruthy();

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(0);

    const reversals = await TokenLedgerEntry.find({
      tenantId: tenant._id,
      type: 'adjustment_debit',
    });
    expect(reversals).toHaveLength(1);
    expect(reversals[0].amount).toBe(300);
    expect(reversals[0].referenceType).toBe('payment_transaction');
    expect(reversals[0].metadata.reason).toBe('refunded');

    const replay = await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({ id: 'event-refund-again', type: 'payment', data: { id: 'pay_refund_flow' } });
    expect(replay.status).toBe(200);

    const refundEmail = await PaymentNotification.find({ type: 'token_payment_refunded' });
    expect(refundEmail).toHaveLength(1);
    const reversalAgain = await TokenLedgerEntry.find({
      tenantId: tenant._id,
      type: 'adjustment_debit',
    });
    expect(reversalAgain).toHaveLength(1);
  });

  it('creates one traceable token reversal for a charged-back payment', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const pkg = await createPackage({ tokens: 125 });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: pkg._id.toString() });
    const tx = await PaymentTransaction.findById(created.body.data.transaction.id);

    scriptApprovedPayment(provider, tx, 'pay_chargeback_flow');
    await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({ id: 'event-cb-approve', type: 'payment', data: { id: 'pay_chargeback_flow' } });

    provider._setPaymentState('pay_chargeback_flow', {
      status: 'charged_back',
      rawStatus: 'charged_back',
      externalReference: tx.externalReference,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      payerEmail: 'payer@example.com',
      preferenceId: tx.providerPreferenceId,
      paidAt: new Date().toISOString(),
      raw: { mock: true },
    });
    const chargeback = await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({ id: 'event-cb', type: 'payment', data: { id: 'pay_chargeback_flow' } });
    expect(chargeback.status).toBe(200);

    const reloaded = await PaymentTransaction.findById(tx._id);
    expect(reloaded.status).toBe('charged_back');
    expect(reloaded.tokenReversed).toBe(true);

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(0);
    const reversal = await TokenLedgerEntry.findOne({
      tenantId: tenant._id,
      type: 'adjustment_debit',
    });
    expect(reversal.amount).toBe(125);
    expect(reversal.metadata.reason).toBe('charged_back');
    expect(await PaymentNotification.countDocuments({ type: 'token_payment_charged_back' })).toBe(
      1,
    );
  });

  it('passes the webhook resource id into signature verification before fetching provider state', async () => {
    const { processIncomingWebhook } = await import('../modules/payments/payment.service.js');
    const seenResourceIds = [];
    const provider = {
      getProviderName: () => 'mock',
      verifyWebhookSignature: (_rawBody, headers) => {
        seenResourceIds.push(headers['x-resource-id']);
        return true;
      },
      fetchPayment: async (id) => ({
        id,
        status: 'failed',
        rawStatus: 'unknown',
        externalReference: null,
        amountMinor: null,
        currency: null,
        payerEmail: null,
        preferenceId: null,
        paidAt: null,
        raw: { mock: true },
      }),
    };

    const result = await processIncomingWebhook({
      provider,
      body: { id: 'event-signed', type: 'payment', data: { id: 'mp_pay_signed' } },
      rawBody: '{}',
      headers: {},
      env: { ...loadEnv(), MERCADOPAGO_WEBHOOK_SECRET: 'configured' },
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('unknown_external_reference');
    expect(seenResourceIds).toEqual(['mp_pay_signed']);
  });

  it('rejects a delivery with an invalid signature when MERCADOPAGO_WEBHOOK_SECRET is set', async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = 'shhh';
    // Reset env cache so the new secret is picked up.
    const { resetEnvCache } = await import('../config/env.js');
    resetEnvCache();
    resetPaymentProvider();
    // We use the mock provider but we override `verifyWebhookSignature` to
    // return false to drive the rejection path.
    const provider = installMockProvider();
    provider.verifyWebhookSignature = () => false;

    const res = await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({ id: 'event-bad', type: 'payment', data: { id: 'pay_x' } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('WEBHOOK_REJECTED');

    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    resetEnvCache();
  });
});

// ---------------------------------------------------------------------
// Idempotent notification dispatch
// ---------------------------------------------------------------------

describe('PaymentNotification idempotency', () => {
  it('refuses to send the same idempotency key twice', async () => {
    const { sendPaymentNotification } = await import('../modules/payments/notification.service.js');

    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });

    const first = await sendPaymentNotification({
      type: 'low_token_balance',
      tenantId: tenant._id,
      idempotencyKey: 'low_token_balance:abc',
      data: { balance: 5, threshold: 100 },
    });
    expect(first.status).toBe('sent');

    const second = await sendPaymentNotification({
      type: 'low_token_balance',
      tenantId: tenant._id,
      idempotencyKey: 'low_token_balance:abc',
      data: { balance: 5, threshold: 100 },
    });
    expect(second.status).toBe('duplicate');

    const rows = await PaymentNotification.find({ idempotencyKey: 'low_token_balance:abc' });
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------
// Reminder jobs
// ---------------------------------------------------------------------

describe('Low-token-balance reminder', () => {
  it('emails tenants whose balance is at or below the threshold exactly once per day', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    await setWalletBalance(tenant._id, 5);

    const result = await reminders.runLowTokenBalanceReminders();
    expect(result.processed).toBe(1);
    expect(result.results[0].status).toBe('sent');

    // Running again on the same day must be a no-op.
    const replay = await reminders.runLowTokenBalanceReminders();
    expect(replay.processed).toBe(1);
    expect(replay.results[0].status).toBe('duplicate');
  });
});

// ---------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------

describe('Subscriptions', () => {
  const seedPlan = (overrides = {}) =>
    SubscriptionPlan.create({
      name: 'Pro monthly',
      code: 'pro_monthly',
      priceMinor: 4900,
      currency: 'USD',
      intervalCount: 1,
      intervalUnit: 'months',
      includedTokens: 1000,
      status: 'active',
      ...overrides,
    });

  it('lets a tenant create a preapproval and stores a pending subscription', async () => {
    installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const plan = await seedPlan();
    const token = await login('acme@test.local');

    const res = await request(app)
      .post('/api/v1/billing/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.data.preapproval.initPoint).toMatch(/mock-checkout/);

    const sub = await TenantSubscription.findOne({ tenantId: tenant._id });
    expect(sub.status).toBe('pending');
    expect(sub.includedTokens).toBe(plan.includedTokens);
  });

  it('refuses to stack a second active subscription on the same tenant', async () => {
    installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const plan = await seedPlan();
    const token = await login('acme@test.local');

    const first = await request(app)
      .post('/api/v1/billing/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan._id.toString() });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/billing/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan._id.toString() });
    expect(second.status).toBe(409);
  });

  it('credits included tokens exactly once per authorized payment', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const plan = await seedPlan({ includedTokens: 750 });

    const subscription = await subscriptionService.createSubscription({
      tenantId: tenant._id,
      planId: plan._id.toString(),
      payerEmail: 'payer@example.com',
      actor: null,
    });

    // Move the local subscription state to authorized so the auth-payment
    // handler will accept the renewal event.
    await TenantSubscription.updateOne(
      { _id: subscription.subscription.id },
      { $set: { status: 'authorized', authorizedAt: new Date() } },
    );

    // Script the authorized payment response.
    provider.authorizedPaymentStateFor = null;
    provider.fetchAuthorizedPayment = async (id) => ({
      id: String(id),
      status: 'processed',
      rawStatus: 'processed',
      preapprovalId: subscription.preapproval.id,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      paymentDate: new Date(),
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paymentId: 'mp_pay_1',
      raw: { mock: true },
    });

    const body = {
      id: 'event-auth-1',
      type: 'subscription_authorized_payment',
      data: { id: 'auth_pay_1' },
    };
    const first = await request(app).post('/api/v1/webhooks/mercadopago').send(body);
    expect(first.status).toBe(200);

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(750);

    const invoice = await SubscriptionInvoice.findOne({
      mercadoPagoAuthorizedPaymentId: 'auth_pay_1',
    });
    expect(invoice.tokenCredited).toBe(true);

    // Replay with the same provider event id → duplicate.
    const replay = await request(app).post('/api/v1/webhooks/mercadopago').send(body);
    expect(replay.body.data.status).toBe('duplicate');
    const walletAgain = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(walletAgain.balance).toBe(750);
  });

  it('does not duplicate subscription invoices, token credits, or emails across distinct events for the same authorized payment', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const plan = await seedPlan({ includedTokens: 600 });

    const subscription = await subscriptionService.createSubscription({
      tenantId: tenant._id,
      planId: plan._id.toString(),
      payerEmail: 'payer@example.com',
      actor: null,
    });
    await TenantSubscription.updateOne(
      { _id: subscription.subscription.id },
      { $set: { status: 'authorized', authorizedAt: new Date() } },
    );

    provider.fetchAuthorizedPayment = async (id) => ({
      id: String(id),
      status: 'processed',
      rawStatus: 'processed',
      preapprovalId: subscription.preapproval.id,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      paymentDate: new Date(),
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paymentId: 'mp_pay_sub_once',
      raw: { mock: true },
    });

    for (const eventId of ['event-auth-repeat-1', 'event-auth-repeat-2']) {
      const res = await request(app)
        .post('/api/v1/webhooks/mercadopago')
        .send({
          id: eventId,
          type: 'subscription_authorized_payment',
          data: { id: 'auth_pay_repeat' },
        });
      expect(res.status).toBe(200);
    }

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(600);
    expect(
      await SubscriptionInvoice.countDocuments({
        mercadoPagoAuthorizedPaymentId: 'auth_pay_repeat',
      }),
    ).toBe(1);
    expect(await TokenLedgerEntry.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(
      await PaymentNotification.countDocuments({ type: 'subscription_payment_approved' }),
    ).toBe(1);
  });

  it('sends retry reminders for failed subscription payments without granting tokens', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const plan = await seedPlan({ includedTokens: 900 });

    const subscription = await subscriptionService.createSubscription({
      tenantId: tenant._id,
      planId: plan._id.toString(),
      payerEmail: 'payer@example.com',
      actor: null,
    });
    await TenantSubscription.updateOne(
      { _id: subscription.subscription.id },
      { $set: { status: 'authorized', authorizedAt: new Date() } },
    );

    provider.fetchAuthorizedPayment = async (id) => ({
      id: String(id),
      status: 'recycling',
      rawStatus: 'cc_rejected_insufficient_amount',
      preapprovalId: subscription.preapproval.id,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      paymentDate: null,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paymentId: null,
      raw: { mock: true },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/mercadopago')
      .send({
        id: 'event-auth-retry',
        type: 'subscription_authorized_payment',
        data: { id: 'auth_pay_retry' },
      });
    expect(res.status).toBe(200);

    const invoice = await SubscriptionInvoice.findOne({
      mercadoPagoAuthorizedPaymentId: 'auth_pay_retry',
    });
    expect(invoice.status).toBe('recycling');
    expect(invoice.tokenCredited).toBe(false);
    expect(invoice.failureReason).toBe('cc_rejected_insufficient_amount');
    expect(await TokenLedgerEntry.countDocuments({ tenantId: tenant._id })).toBe(0);
    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet?.balance ?? 0).toBe(0);
    expect(await PaymentNotification.countDocuments({ type: 'subscription_payment_retry' })).toBe(
      1,
    );
  });

  it('pauses and resumes a subscription through Mercado Pago state', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const plan = await seedPlan();
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/billing/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan._id.toString() });
    expect(created.status).toBe(201);

    const subId = created.body.data.subscription.id;
    await TenantSubscription.updateOne(
      { _id: subId },
      { $set: { status: 'authorized', authorizedAt: new Date() } },
    );

    const pause = await request(app)
      .post(`/api/v1/billing/subscriptions/${subId}/pause`)
      .set('Authorization', `Bearer ${token}`);
    expect(pause.status).toBe(200);
    expect(pause.body.data.subscription.status).toBe('paused');

    const preapprovalId = created.body.data.subscription.mercadoPagoPreapprovalId;
    expect((await provider.fetchPreapproval(preapprovalId)).status).toBe('paused');

    const resume = await request(app)
      .post(`/api/v1/billing/subscriptions/${subId}/resume`)
      .set('Authorization', `Bearer ${token}`);
    expect(resume.status).toBe(200);
    expect(resume.body.data.subscription.status).toBe('authorized');
    expect((await provider.fetchPreapproval(preapprovalId)).status).toBe('authorized');
  });

  it('cancels a subscription via Mercado Pago and records the cancellation', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'acme@test.local' });
    const plan = await seedPlan();
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/billing/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan._id.toString() });
    expect(created.status).toBe(201);

    const subId = created.body.data.subscription.id;
    const cancel = await request(app)
      .post(`/api/v1/billing/subscriptions/${subId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.subscription.status).toBe('cancelled');

    // The mock provider records the status update.
    const preapprovalId = created.body.data.subscription.mercadoPagoPreapprovalId;
    const updated = await provider.fetchPreapproval(preapprovalId);
    expect(updated.status).toBe('cancelled');
  });
});

// ---------------------------------------------------------------------
// Tenant isolation on admin endpoints
// ---------------------------------------------------------------------

describe('Admin payment endpoints', () => {
  it('lists payments globally for super admins and prevents client roles', async () => {
    installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });

    const clientToken = await login('client@test.local');
    const denied = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(denied.status).toBe(403);

    const superToken = await login('super@test.local');
    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('returns webhook history for super admins', async () => {
    await PaymentWebhookEvent.create({
      provider: 'mercadopago',
      providerEventId: 'evt_1',
      eventType: 'payment',
      status: 'processed',
    });
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    const token = await login('super@test.local');
    const res = await request(app)
      .get('/api/v1/admin/payment-webhooks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].providerEventId).toBe('evt_1');
  });

  it('prevents client roles from calling admin payment mutation endpoints', async () => {
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    const clientToken = await login('client@test.local');

    const reconcile = await request(app)
      .post('/api/v1/admin/payments/reconcile')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ paymentId: 'mp_pay_1' });
    expect(reconcile.status).toBe(403);

    const sync = await request(app)
      .post('/api/v1/admin/subscriptions/507f1f77bcf86cd799439011/sync')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(sync.status).toBe(403);
  });

  it('allows repeated admin reconciliation to refetch changed provider state safely', async () => {
    const provider = installMockProvider();
    const tenant = await makeTenant('Acme');
    await makeUser({ tenant, email: 'client@test.local' });
    await makeUser({ tenant: null, email: 'super@test.local', role: ROLES.SUPER_ADMIN });
    const pkg = await createPackage({ tokens: 700 });
    const clientToken = await login('client@test.local');
    const superToken = await login('super@test.local');

    const created = await request(app)
      .post('/api/v1/billing/mercadopago/preferences')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ packageId: pkg._id.toString() });
    const tx = await PaymentTransaction.findById(created.body.data.transaction.id);

    provider._setPaymentState('mp_pay_reconcile', {
      status: 'pending',
      rawStatus: 'pending',
      externalReference: tx.externalReference,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      payerEmail: 'payer@example.com',
      preferenceId: tx.providerPreferenceId,
      paidAt: null,
      raw: { mock: true },
    });
    const first = await request(app)
      .post('/api/v1/admin/payments/reconcile')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ paymentId: 'mp_pay_reconcile' });
    expect(first.status).toBe(200);

    scriptApprovedPayment(provider, tx, 'mp_pay_reconcile');
    const second = await request(app)
      .post('/api/v1/admin/payments/reconcile')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ paymentId: 'mp_pay_reconcile' });
    expect(second.status).toBe(200);

    const wallet = await TokenWallet.findOne({ tenantId: tenant._id });
    expect(wallet.balance).toBe(700);
    expect(await TokenLedgerEntry.countDocuments({ tenantId: tenant._id })).toBe(1);
  });
});
