import crypto from 'node:crypto';

import mongoose from 'mongoose';

import * as repo from './payment.repository.js';
import * as tokenService from '../tokens/token.service.js';
import * as tokenRepo from '../tokens/token.repository.js';
import { resolvePaymentProvider } from './providers/provider.factory.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { sendPaymentNotification } from './notification.service.js';
import { registerSubscriptionHandlers } from './payment.service.js';
import { Tenant } from '../tenants/tenant.model.js';
import { User } from '../users/user.model.js';
import { loadEnv } from '../../config/env.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from '../../common/errors/index.js';

export const SUBSCRIPTION_AUDIT_ACTIONS = Object.freeze({
  PLAN_CREATED: 'subscriptions.plan.created',
  PLAN_UPDATED: 'subscriptions.plan.updated',
  PLAN_STATUS_CHANGED: 'subscriptions.plan.status_changed',
  SUBSCRIPTION_CREATED: 'subscriptions.subscription.created',
  SUBSCRIPTION_ACTIVATED: 'subscriptions.subscription.activated',
  SUBSCRIPTION_PAUSED: 'subscriptions.subscription.paused',
  SUBSCRIPTION_RESUMED: 'subscriptions.subscription.resumed',
  SUBSCRIPTION_CANCELLED: 'subscriptions.subscription.cancelled',
  SUBSCRIPTION_SYNCED: 'subscriptions.subscription.synced',
  INVOICE_PROCESSED: 'subscriptions.invoice.processed',
});

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const ensureTenant = (tenantId) => {
  if (!tenantId) throw new AuthorizationError('Tenant context is required');
  return tenantId.toString();
};

const toMajor = (minor) => Number(minor ?? 0) / 100;

const buildExternalReference = () =>
  `cupcake_sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

// Public DTO converters -----------------------------------------------

export const toPublicPlan = (p) => ({
  id: p._id.toString(),
  name: p.name,
  description: p.description ?? null,
  code: p.code,
  priceMinor: p.priceMinor,
  currency: p.currency,
  intervalCount: p.intervalCount,
  intervalUnit: p.intervalUnit,
  includedTokens: p.includedTokens,
  status: p.status,
  mercadoPagoPlanId: p.mercadoPagoPlanId ?? null,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export const toPublicSubscription = (s) => ({
  id: s._id.toString(),
  tenantId: s.tenantId?.toString() ?? null,
  planId: s.planId?.toString() ?? null,
  planCode: s.planCode,
  planNameSnapshot: s.planNameSnapshot,
  includedTokens: s.includedTokens,
  status: s.status,
  mercadoPagoPreapprovalId: s.mercadoPagoPreapprovalId ?? null,
  mercadoPagoPayerEmail: s.mercadoPagoPayerEmail ?? null,
  initPoint: s.initPoint ?? null,
  priceMinor: s.priceMinor,
  currency: s.currency,
  currentPeriodStart: s.currentPeriodStart ?? null,
  currentPeriodEnd: s.currentPeriodEnd ?? null,
  nextChargeAt: s.nextChargeAt ?? null,
  cancelAtPeriodEnd: !!s.cancelAtPeriodEnd,
  cancelledAt: s.cancelledAt ?? null,
  authorizedAt: s.authorizedAt ?? null,
  pausedAt: s.pausedAt ?? null,
  externalReference: s.externalReference,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

export const toPublicInvoice = (i) => ({
  id: i._id.toString(),
  tenantId: i.tenantId?.toString() ?? null,
  subscriptionId: i.subscriptionId?.toString() ?? null,
  mercadoPagoAuthorizedPaymentId: i.mercadoPagoAuthorizedPaymentId,
  mercadoPagoPaymentId: i.mercadoPagoPaymentId ?? null,
  status: i.status,
  amountMinor: i.amountMinor,
  currency: i.currency,
  periodStart: i.periodStart ?? null,
  periodEnd: i.periodEnd ?? null,
  paidAt: i.paidAt ?? null,
  tokenCredited: !!i.tokenCredited,
  tokenLedgerEntryId: i.tokenLedgerEntryId ? i.tokenLedgerEntryId.toString() : null,
  failureReason: i.failureReason ?? null,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
});

// Plans ---------------------------------------------------------------

export const listPlans = async ({ status, page, limit, sort } = {}) => {
  const result = await repo.findPlans({ status, page, limit, sort });
  return {
    items: result.items.map(toPublicPlan),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const listActivePlans = async () => listPlans({ status: 'active', limit: 100 });

export const createPlan = async ({ payload, actor }) => {
  const existing = await repo.findPlanByCode(payload.code);
  if (existing) throw new ConflictError('A subscription plan with this code already exists');
  const plan = await repo.createPlan(payload);
  await recordAuditEvent({
    action: SUBSCRIPTION_AUDIT_ACTIONS.PLAN_CREATED,
    entityType: 'subscription_plan',
    entityId: plan._id.toString(),
    userId: actor?.id ?? null,
    metadata: { code: plan.code, priceMinor: plan.priceMinor, currency: plan.currency },
  });
  return toPublicPlan(plan);
};

export const updatePlan = async ({ id, payload, actor }) => {
  assertObjectId(id, 'plan id');
  const plan = await repo.findPlanById(id);
  if (!plan) throw new NotFoundError('Subscription plan not found');
  if (payload.code && payload.code !== plan.code) {
    const dup = await repo.findPlanByCode(payload.code);
    if (dup) throw new ConflictError('A subscription plan with this code already exists');
  }
  await repo.savePlan(plan, payload);
  await recordAuditEvent({
    action: SUBSCRIPTION_AUDIT_ACTIONS.PLAN_UPDATED,
    entityType: 'subscription_plan',
    entityId: plan._id.toString(),
    userId: actor?.id ?? null,
    metadata: payload,
  });
  return toPublicPlan(plan);
};

export const updatePlanStatus = async ({ id, status, actor }) => {
  assertObjectId(id, 'plan id');
  const plan = await repo.findPlanById(id);
  if (!plan) throw new NotFoundError('Subscription plan not found');
  plan.status = status;
  await plan.save();
  await recordAuditEvent({
    action: SUBSCRIPTION_AUDIT_ACTIONS.PLAN_STATUS_CHANGED,
    entityType: 'subscription_plan',
    entityId: plan._id.toString(),
    userId: actor?.id ?? null,
    metadata: { status },
  });
  return toPublicPlan(plan);
};

// Subscriptions ------------------------------------------------------

const resolvePayerEmail = async ({ tenantId, payerEmail }) => {
  if (payerEmail) return payerEmail;
  const tenant = await Tenant.findById(tenantId).select('ownerUserId').lean();
  if (!tenant?.ownerUserId) return null;
  const user = await User.findById(tenant.ownerUserId).select('email').lean();
  return user?.email ?? null;
};

/**
 * Create a Mercado Pago preapproval for the given plan and store the matching
 * `tenant_subscriptions` doc. The returned `initPoint` is the URL the user
 * must follow to authorise the recurring charge.
 */
export const createSubscription = async ({
  tenantId,
  planId,
  payerEmail = null,
  actor,
  env = loadEnv(),
  provider = resolvePaymentProvider({ env }),
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(planId, 'plan id');
  const plan = await repo.findPlanById(planId);
  if (!plan || plan.status !== 'active') {
    throw new NotFoundError('Subscription plan is not available');
  }

  // Reject if the tenant already has an active or pending subscription. The
  // product surfaces are single-active-subscription; an admin can extend
  // later if multi-plan stacking is needed.
  const active = await repo.findActiveSubscriptionForTenant(tenant);
  if (active) {
    throw new ConflictError('Tenant already has an active or pending subscription');
  }

  const resolvedPayerEmail = await resolvePayerEmail({ tenantId: tenant, payerEmail });
  if (!resolvedPayerEmail) {
    throw new ValidationError('A payer email is required to create a subscription');
  }

  const externalReference = buildExternalReference();

  const subscription = await repo.createSubscription({
    tenantId: tenant,
    planId: plan._id,
    planCode: plan.code,
    planNameSnapshot: plan.name,
    includedTokens: plan.includedTokens,
    status: 'pending',
    mercadoPagoPayerEmail: resolvedPayerEmail,
    priceMinor: plan.priceMinor,
    currency: plan.currency,
    requestedBy: actor?.id ?? null,
    externalReference,
  });

  let preapproval;
  try {
    preapproval = await provider.createPreapproval({
      externalReference,
      reason: `${plan.name} (${plan.code})`,
      payerEmail: resolvedPayerEmail,
      amountMajor: toMajor(plan.priceMinor),
      currency: plan.currency,
      frequency: plan.intervalCount,
      frequencyType: plan.intervalUnit,
      backUrl: env.MERCADOPAGO_SUCCESS_URL,
      planId: plan.mercadoPagoPlanId ?? null,
    });
  } catch (err) {
    await subscription.deleteOne();
    throw err;
  }

  await repo.saveSubscription(subscription, {
    mercadoPagoPreapprovalId: preapproval.preapprovalId,
    initPoint: preapproval.initPoint,
    status: preapproval.status === 'authorized' ? 'authorized' : 'pending',
    authorizedAt: preapproval.status === 'authorized' ? new Date() : null,
  });

  await recordAuditEvent({
    action: SUBSCRIPTION_AUDIT_ACTIONS.SUBSCRIPTION_CREATED,
    entityType: 'tenant_subscription',
    entityId: subscription._id.toString(),
    userId: actor?.id ?? null,
    tenantId: tenant,
    metadata: { planId: plan._id.toString(), preapprovalId: preapproval.preapprovalId },
  });

  await sendPaymentNotification({
    type: 'subscription_created',
    tenantId: tenant,
    referenceType: 'tenant_subscription',
    referenceId: subscription._id.toString(),
    idempotencyKey: `subscription_created:${subscription._id.toString()}`,
    recipientEmail: resolvedPayerEmail,
    data: { planName: plan.name },
  });

  return {
    subscription: toPublicSubscription(subscription),
    preapproval: {
      id: preapproval.preapprovalId,
      initPoint: preapproval.initPoint,
      externalReference,
    },
  };
};

export const listSubscriptionsForTenant = async ({ tenantId, query = {} }) => {
  const tenant = ensureTenant(tenantId);
  const result = await repo.findSubscriptions({
    tenantId: tenant,
    status: query.status,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? '-createdAt',
  });
  return {
    items: result.items.map(toPublicSubscription),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const listAdminSubscriptions = async ({ query = {} } = {}) => {
  const result = await repo.findSubscriptions({
    tenantId: null,
    status: query.status,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? '-createdAt',
  });
  return {
    items: result.items.map(toPublicSubscription),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getSubscriptionForTenant = async ({ tenantId, id }) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'subscription id');
  const doc = await repo.findSubscriptionById({ id, tenantId: tenant });
  if (!doc) throw new NotFoundError('Subscription not found');
  return toPublicSubscription(doc);
};

/**
 * Lifecycle transitions. Each path mutates Mercado Pago first, then mirrors
 * the result locally. If the provider call fails the local state stays put.
 */

const requireSubscription = async ({ id, tenantId = null }) => {
  assertObjectId(id, 'subscription id');
  const doc = await repo.findSubscriptionById({ id, tenantId });
  if (!doc) throw new NotFoundError('Subscription not found');
  return doc;
};

export const cancelSubscription = async ({
  id,
  tenantId = null,
  actor,
  provider = resolvePaymentProvider(),
}) => {
  const sub = await requireSubscription({ id, tenantId });
  if (sub.status === 'cancelled') {
    return toPublicSubscription(sub);
  }
  if (sub.mercadoPagoPreapprovalId) {
    try {
      await provider.updatePreapprovalStatus(sub.mercadoPagoPreapprovalId, 'cancelled');
    } catch (err) {
      throw new ConflictError(`Mercado Pago rejected the cancellation: ${err.message}`);
    }
  }
  await repo.saveSubscription(sub, {
    status: 'cancelled',
    cancelledAt: new Date(),
    nextChargeAt: null,
  });
  await recordAuditEvent({
    action: SUBSCRIPTION_AUDIT_ACTIONS.SUBSCRIPTION_CANCELLED,
    entityType: 'tenant_subscription',
    entityId: sub._id.toString(),
    userId: actor?.id ?? null,
    tenantId: sub.tenantId,
    metadata: { preapprovalId: sub.mercadoPagoPreapprovalId ?? null },
  });
  await sendPaymentNotification({
    type: 'subscription_cancelled',
    tenantId: sub.tenantId,
    referenceType: 'tenant_subscription',
    referenceId: sub._id.toString(),
    idempotencyKey: `subscription_cancelled:${sub._id.toString()}`,
    recipientEmail: sub.mercadoPagoPayerEmail,
    data: { planName: sub.planNameSnapshot },
  });
  return toPublicSubscription(sub);
};

export const pauseSubscription = async ({
  id,
  tenantId = null,
  actor,
  provider = resolvePaymentProvider(),
}) => {
  const sub = await requireSubscription({ id, tenantId });
  if (sub.status !== 'authorized') {
    throw new ConflictError('Only authorized subscriptions can be paused');
  }
  if (sub.mercadoPagoPreapprovalId) {
    await provider.updatePreapprovalStatus(sub.mercadoPagoPreapprovalId, 'paused');
  }
  await repo.saveSubscription(sub, { status: 'paused', pausedAt: new Date() });
  await recordAuditEvent({
    action: SUBSCRIPTION_AUDIT_ACTIONS.SUBSCRIPTION_PAUSED,
    entityType: 'tenant_subscription',
    entityId: sub._id.toString(),
    userId: actor?.id ?? null,
    tenantId: sub.tenantId,
  });
  await sendPaymentNotification({
    type: 'subscription_paused',
    tenantId: sub.tenantId,
    referenceType: 'tenant_subscription',
    referenceId: sub._id.toString(),
    idempotencyKey: `subscription_paused:${sub._id.toString()}`,
    recipientEmail: sub.mercadoPagoPayerEmail,
    data: { planName: sub.planNameSnapshot },
  });
  return toPublicSubscription(sub);
};

export const resumeSubscription = async ({
  id,
  tenantId = null,
  actor,
  provider = resolvePaymentProvider(),
}) => {
  const sub = await requireSubscription({ id, tenantId });
  if (sub.status !== 'paused') {
    throw new ConflictError('Only paused subscriptions can be resumed');
  }
  if (sub.mercadoPagoPreapprovalId) {
    await provider.updatePreapprovalStatus(sub.mercadoPagoPreapprovalId, 'authorized');
  }
  await repo.saveSubscription(sub, { status: 'authorized', pausedAt: null });
  await recordAuditEvent({
    action: SUBSCRIPTION_AUDIT_ACTIONS.SUBSCRIPTION_RESUMED,
    entityType: 'tenant_subscription',
    entityId: sub._id.toString(),
    userId: actor?.id ?? null,
    tenantId: sub.tenantId,
  });
  return toPublicSubscription(sub);
};

/**
 * Admin reconciliation: pull the latest state from Mercado Pago and mirror
 * it locally. Used when a webhook delivery was lost.
 */
export const syncSubscription = async ({ id, actor, provider = resolvePaymentProvider() }) => {
  const sub = await requireSubscription({ id });
  if (!sub.mercadoPagoPreapprovalId) {
    throw new ConflictError('Subscription is not linked to Mercado Pago');
  }
  const fetched = await provider.fetchPreapproval(sub.mercadoPagoPreapprovalId);
  await applyPreapprovalFetched(sub, fetched);
  await recordAuditEvent({
    action: SUBSCRIPTION_AUDIT_ACTIONS.SUBSCRIPTION_SYNCED,
    entityType: 'tenant_subscription',
    entityId: sub._id.toString(),
    userId: actor?.id ?? null,
    tenantId: sub.tenantId,
    metadata: { status: fetched.status },
  });
  return toPublicSubscription(sub);
};

const applyPreapprovalFetched = async (sub, fetched) => {
  const wasAuthorized = sub.status === 'authorized';
  const updates = {
    status: fetched.status,
    nextChargeAt: fetched.nextPaymentDate ?? sub.nextChargeAt,
  };
  if (fetched.status === 'authorized' && !sub.authorizedAt) {
    updates.authorizedAt = new Date();
  }
  if (fetched.status === 'cancelled' && !sub.cancelledAt) {
    updates.cancelledAt = new Date();
  }
  if (fetched.status === 'paused' && !sub.pausedAt) {
    updates.pausedAt = new Date();
  }
  await repo.saveSubscription(sub, updates);

  if (fetched.status === 'authorized' && !wasAuthorized) {
    await sendPaymentNotification({
      type: 'subscription_activated',
      tenantId: sub.tenantId,
      referenceType: 'tenant_subscription',
      referenceId: sub._id.toString(),
      idempotencyKey: `subscription_activated:${sub._id.toString()}`,
      recipientEmail: sub.mercadoPagoPayerEmail,
      data: { planName: sub.planNameSnapshot },
    });
  }
};

// Webhook handlers ----------------------------------------------------

const handlePreapprovalEvent = async ({ provider, preapprovalId, event: _event }) => {
  if (!preapprovalId) return { status: 'skipped', reason: 'missing_preapproval_id' };
  const fetched = await provider.fetchPreapproval(String(preapprovalId));
  // Match by external reference first (we control it), preapproval id second.
  let subscription = fetched.externalReference
    ? await repo.findSubscriptionByExternalReference(fetched.externalReference)
    : null;
  if (!subscription) {
    subscription = await repo.findSubscriptionByPreapprovalId(String(preapprovalId));
  }
  if (!subscription) {
    return { status: 'skipped', reason: 'unknown_preapproval' };
  }
  await applyPreapprovalFetched(subscription, fetched);
  return { status: 'processed', transaction: null };
};

const handleAuthorizedPaymentEvent = async ({ provider, authorizedPaymentId, event: _event }) => {
  if (!authorizedPaymentId) return { status: 'skipped', reason: 'missing_authorized_payment_id' };

  const fetched = await provider.fetchAuthorizedPayment(String(authorizedPaymentId));
  if (!fetched.preapprovalId) {
    return { status: 'skipped', reason: 'missing_preapproval_id' };
  }

  const subscription = await repo.findSubscriptionByPreapprovalId(fetched.preapprovalId);
  if (!subscription) {
    return { status: 'skipped', reason: 'unknown_preapproval' };
  }

  // Idempotently create or update the invoice row.
  let invoice = await repo.findInvoiceByAuthorizedPaymentId(String(fetched.id));
  if (!invoice) {
    invoice = await repo.createInvoice({
      tenantId: subscription.tenantId,
      subscriptionId: subscription._id,
      mercadoPagoAuthorizedPaymentId: String(fetched.id),
      mercadoPagoPaymentId: fetched.paymentId ?? null,
      status: fetched.status,
      amountMinor: fetched.amountMinor ?? subscription.priceMinor,
      currency: fetched.currency ?? subscription.currency,
      periodStart: fetched.periodStart ?? null,
      periodEnd: fetched.periodEnd ?? null,
      paidAt: fetched.status === 'processed' ? (fetched.paymentDate ?? new Date()) : null,
    });
  } else {
    await repo.saveInvoice(invoice, {
      status: fetched.status,
      mercadoPagoPaymentId: fetched.paymentId ?? invoice.mercadoPagoPaymentId,
      paidAt:
        fetched.status === 'processed' ? (fetched.paymentDate ?? invoice.paidAt) : invoice.paidAt,
    });
  }

  if (fetched.status === 'processed' && !invoice.tokenCredited) {
    // Credit the included tokens through the standard ledger.
    await tokenService.ensureWallet({ tenantId: subscription.tenantId });
    if (subscription.includedTokens > 0) {
      const wallet = await tokenRepo.atomicCredit({
        tenantId: subscription.tenantId,
        amount: subscription.includedTokens,
      });
      const ledger = await tokenRepo.createLedgerEntry({
        tenantId: subscription.tenantId,
        type: 'credit',
        channel: null,
        amount: subscription.includedTokens,
        balanceAfter: wallet.balance,
        referenceType: 'subscription_invoice',
        referenceId: invoice._id.toString(),
        description: `Subscription renewal: ${subscription.planNameSnapshot}`,
        metadata: {
          planCode: subscription.planCode,
          authorizedPaymentId: invoice.mercadoPagoAuthorizedPaymentId,
        },
      });
      await repo.saveInvoice(invoice, {
        tokenCredited: true,
        tokenLedgerEntryId: ledger._id,
      });
    } else {
      await repo.saveInvoice(invoice, { tokenCredited: true });
    }

    // Update the subscription period state.
    await repo.saveSubscription(subscription, {
      currentPeriodStart: fetched.periodStart ?? subscription.currentPeriodStart,
      currentPeriodEnd: fetched.periodEnd ?? subscription.currentPeriodEnd,
      nextChargeAt: fetched.periodEnd ?? subscription.nextChargeAt,
    });

    await sendPaymentNotification({
      type: 'subscription_payment_approved',
      tenantId: subscription.tenantId,
      referenceType: 'subscription_invoice',
      referenceId: invoice._id.toString(),
      idempotencyKey: `subscription_payment_approved:${invoice._id.toString()}`,
      recipientEmail: subscription.mercadoPagoPayerEmail,
      data: {
        formattedPrice: `${toMajor(invoice.amountMinor).toFixed(2)} ${invoice.currency}`,
        tokens: subscription.includedTokens,
        reference: invoice.mercadoPagoAuthorizedPaymentId,
      },
    });

    await recordAuditEvent({
      action: SUBSCRIPTION_AUDIT_ACTIONS.INVOICE_PROCESSED,
      entityType: 'subscription_invoice',
      entityId: invoice._id.toString(),
      tenantId: subscription.tenantId,
      metadata: {
        subscriptionId: subscription._id.toString(),
        amountMinor: invoice.amountMinor,
      },
    });
  } else if (fetched.status === 'rejected' || fetched.status === 'recycling') {
    await repo.saveInvoice(invoice, {
      failureReason: fetched.rawStatus,
    });
    await sendPaymentNotification({
      type:
        fetched.status === 'rejected'
          ? 'subscription_payment_failed'
          : 'subscription_payment_retry',
      tenantId: subscription.tenantId,
      referenceType: 'subscription_invoice',
      referenceId: invoice._id.toString(),
      idempotencyKey: `${fetched.status === 'rejected' ? 'subscription_payment_failed' : 'subscription_payment_retry'}:${invoice._id.toString()}`,
      recipientEmail: subscription.mercadoPagoPayerEmail,
      data: { planName: subscription.planNameSnapshot },
    });
  }

  return { status: 'processed', transaction: null };
};

registerSubscriptionHandlers({ handlePreapprovalEvent, handleAuthorizedPaymentEvent });

// Invoices / reminders -----------------------------------------------

export const listInvoicesForTenant = async ({ tenantId, query = {} }) => {
  const tenant = ensureTenant(tenantId);
  const result = await repo.findInvoicesForTenant({
    tenantId: tenant,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? '-createdAt',
  });
  return {
    items: result.items.map(toPublicInvoice),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

/**
 * Find subscriptions whose `nextChargeAt` falls inside the renewal-reminder
 * window so the scheduled job can email tenants. Returns subscriptions only;
 * the caller decides whether to call `sendPaymentNotification`.
 */
export const findUpcomingRenewals = async ({ env = loadEnv() } = {}) => {
  const days = env.PAYMENT_REMINDER_DAYS_BEFORE ?? 3;
  const before = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return repo.findSubscriptionsDueForRenewalReminder({ before });
};

export const __testing = {
  handlePreapprovalEvent,
  handleAuthorizedPaymentEvent,
  applyPreapprovalFetched,
};
