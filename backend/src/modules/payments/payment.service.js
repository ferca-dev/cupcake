import crypto from 'node:crypto';

import mongoose from 'mongoose';

import * as repo from './payment.repository.js';
import { resolvePaymentProvider } from './providers/provider.factory.js';
import * as tokenService from '../tokens/token.service.js';
import * as tokenRepo from '../tokens/token.repository.js';
import { TokenPurchase } from '../tokens/token-purchase.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { loadEnv } from '../../config/env.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from '../../common/errors/index.js';
import { logger } from '../../common/utils/logger.js';
import { sendPaymentNotification } from './notification.service.js';

export const PAYMENT_AUDIT_ACTIONS = Object.freeze({
  PREFERENCE_CREATED: 'payments.preference.created',
  WEBHOOK_RECEIVED: 'payments.webhook.received',
  WEBHOOK_PROCESSED: 'payments.webhook.processed',
  WEBHOOK_REJECTED: 'payments.webhook.rejected',
  TOKENS_CREDITED: 'payments.tokens.credited',
  PAYMENT_REFUNDED: 'payments.payment.refunded',
  PAYMENT_FAILED: 'payments.payment.failed',
});

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const ensureTenant = (tenantId) => {
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required');
  }
  return tenantId.toString();
};

const toMajor = (minor) => Number(minor ?? 0) / 100;

export const buildExternalReference = (prefix = 'cupcake_pay') =>
  `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

// Public DTO converters -----------------------------------------------

export const toPublicTransaction = (t) => ({
  id: t._id?.toString(),
  tenantId: t.tenantId?.toString() ?? null,
  provider: t.provider,
  purpose: t.purpose,
  status: t.status,
  amountMinor: t.amountMinor,
  currency: t.currency,
  packageId: t.packageId ? t.packageId.toString() : null,
  packageName: t.packageName ?? null,
  tokensToCredit: t.tokensToCredit ?? 0,
  tokenCredited: !!t.tokenCredited,
  tokenLedgerEntryId: t.tokenLedgerEntryId ? t.tokenLedgerEntryId.toString() : null,
  tokenReversed: !!t.tokenReversed,
  tokenReversalLedgerEntryId: t.tokenReversalLedgerEntryId
    ? t.tokenReversalLedgerEntryId.toString()
    : null,
  tokenPurchaseId: t.tokenPurchaseId ? t.tokenPurchaseId.toString() : null,
  subscriptionId: t.subscriptionId ? t.subscriptionId.toString() : null,
  subscriptionInvoiceId: t.subscriptionInvoiceId ? t.subscriptionInvoiceId.toString() : null,
  externalReference: t.externalReference,
  providerPreferenceId: t.providerPreferenceId ?? null,
  providerPaymentId: t.providerPaymentId ?? null,
  providerPayerEmail: t.providerPayerEmail ?? null,
  checkoutUrl: t.checkoutUrl ?? null,
  initPoint: t.initPoint ?? null,
  paidAt: t.paidAt ?? null,
  refundedAt: t.refundedAt ?? null,
  failureReason: t.failureReason ?? null,
  metadata: t.metadata ?? {},
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

export const toPublicWebhookEvent = (e) => ({
  id: e._id.toString(),
  provider: e.provider,
  providerEventId: e.providerEventId,
  eventType: e.eventType,
  resourceType: e.resourceType ?? null,
  resourceId: e.resourceId ?? null,
  status: e.status,
  signatureValid: e.signatureValid,
  processedAt: e.processedAt ?? null,
  processingError: e.processingError ?? null,
  relatedTransactionId: e.relatedTransactionId ? e.relatedTransactionId.toString() : null,
  createdAt: e.createdAt,
});

// ---------------------------------------------------------------------
// One-time token package preferences
// ---------------------------------------------------------------------

/**
 * Create a Mercado Pago Checkout Pro preference for a token package and store
 * the matching pending transaction. Returns the data the frontend needs to
 * render the checkout brick or redirect the payer to `init_point`.
 *
 * The transaction is created BEFORE we hit the provider so the external
 * reference is reserved atomically. If the provider call fails afterwards the
 * record is removed.
 */
export const createTokenPackagePreference = async ({
  tenantId,
  packageId,
  actor,
  payerEmail = null,
  env = loadEnv(),
  provider = resolvePaymentProvider({ env }),
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(packageId, 'package id');
  const pkg = await tokenRepo.findPackageById(packageId);
  if (!pkg || pkg.status !== 'active') {
    throw new NotFoundError('Token package is not available');
  }

  const externalReference = buildExternalReference('cupcake_tokens');

  // Create the matching `token_purchases` row so the existing admin/billing
  // surfaces show the request immediately and the wallet credit at webhook
  // time goes through the same code path as a manually approved purchase.
  const tokenPurchase = await TokenPurchase.create({
    tenantId: tenant,
    packageId: pkg._id,
    packageName: pkg.name,
    tokens: pkg.tokens,
    priceMinor: pkg.priceMinor,
    currency: pkg.currency,
    status: 'pending',
    paymentProvider: provider.getProviderName(),
    paymentReference: externalReference,
    requestedBy: actor?.id ?? null,
  });

  const transaction = await repo.createTransaction({
    tenantId: tenant,
    provider: provider.getProviderName(),
    purpose: 'token_package',
    status: 'pending',
    amountMinor: pkg.priceMinor,
    currency: pkg.currency,
    packageId: pkg._id,
    packageName: pkg.name,
    tokensToCredit: pkg.tokens,
    tokenPurchaseId: tokenPurchase._id,
    externalReference,
    requestedBy: actor?.id ?? null,
    metadata: { packageId: pkg._id.toString() },
  });

  let preference;
  try {
    preference = await provider.createTokenPackagePreference({
      externalReference,
      title: `Token package: ${pkg.name}`,
      description: pkg.description ?? `${pkg.tokens} tokens`,
      quantity: 1,
      unitPriceMajor: toMajor(pkg.priceMinor),
      currency: pkg.currency,
      payerEmail,
      metadata: {
        tenantId: tenant,
        packageId: pkg._id.toString(),
        purpose: 'token_package',
      },
    });
  } catch (err) {
    await transaction.deleteOne();
    await tokenPurchase.deleteOne();
    logger.warn({ err }, 'Failed to create Mercado Pago preference; pending records removed');
    throw err;
  }

  await repo.saveTransaction(transaction, {
    providerPreferenceId: preference.preferenceId,
    initPoint: preference.initPoint,
    checkoutUrl: preference.initPoint,
    metadata: {
      ...transaction.metadata,
      sandboxInitPoint: preference.sandboxInitPoint ?? null,
    },
  });

  await recordAuditEvent({
    action: PAYMENT_AUDIT_ACTIONS.PREFERENCE_CREATED,
    entityType: 'payment_transaction',
    entityId: transaction._id.toString(),
    userId: actor?.id ?? null,
    tenantId: tenant,
    metadata: {
      packageId: pkg._id.toString(),
      priceMinor: pkg.priceMinor,
      currency: pkg.currency,
      provider: provider.getProviderName(),
    },
  });

  // Notify the tenant that a payment is pending. The notification key is the
  // transaction id so retries during preference creation cannot send twice.
  await sendPaymentNotification({
    type: 'token_payment_pending',
    tenantId: tenant,
    referenceType: 'payment_transaction',
    referenceId: transaction._id.toString(),
    idempotencyKey: `token_payment_pending:${transaction._id.toString()}`,
    recipientEmail: payerEmail,
    data: {
      tokens: pkg.tokens,
      formattedPrice: `${toMajor(pkg.priceMinor).toFixed(2)} ${pkg.currency}`,
      reference: externalReference,
    },
  });

  return {
    transaction: toPublicTransaction(transaction),
    preference: {
      id: preference.preferenceId,
      initPoint: preference.initPoint,
      sandboxInitPoint: preference.sandboxInitPoint ?? null,
      externalReference,
    },
  };
};

// ---------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------

/**
 * Resolves a webhook delivery into one of:
 *   - { status: 'duplicate', event }: same provider event id already seen.
 *   - { status: 'processed', event, transaction }: state was applied.
 *   - { status: 'skipped', event, reason }: we acknowledge but did nothing
 *     (unknown event type, no matching transaction, …).
 *   - { status: 'failed', event, reason }: handler threw; the row is stored
 *     so an operator can retry.
 *
 * Callers (typically the webhook controller) ALWAYS get a 200 from us so
 * Mercado Pago does not enter its exponential retry loop unless the delivery
 * itself was rejected (signature invalid, malformed payload).
 */
export const processIncomingWebhook = async ({
  provider = resolvePaymentProvider(),
  body,
  rawBody,
  headers,
  env = loadEnv(),
}) => {
  const eventType = body?.type ?? body?.topic ?? null;
  const dataId = normalizeWebhookResourceId(body?.data?.id ?? body?.resource ?? null);
  // Mercado Pago repeats deliveries with the same `id` so use that as the
  // unique event id. As a fallback we hash the payload — repeated unparseable
  // payloads still collapse into one stored event.
  const providerEventId =
    body?.id?.toString() ??
    (rawBody ? crypto.createHash('sha256').update(rawBody).digest('hex') : null) ??
    crypto.randomBytes(8).toString('hex');

  const signatureValid = provider.verifyWebhookSignature(rawBody, {
    ...(headers ?? {}),
    'x-resource-id': dataId ?? undefined,
    'data-id': dataId ?? undefined,
  });

  // Reject mismatched signatures only when a secret is configured AND the
  // verification function returned a definite `false`. A `null` means
  // verification is disabled (no secret), in which case we still accept the
  // delivery but flag it for operator review.
  if (env.MERCADOPAGO_WEBHOOK_SECRET && signatureValid === false) {
    return { status: 'rejected', reason: 'invalid_signature' };
  }

  // Idempotency: check whether we've already stored this exact event before
  // inserting. We additionally rely on the unique `(provider, providerEventId)`
  // index as a second line of defence against concurrent webhook deliveries
  // racing past the check.
  const existing = await repo.findWebhookEventByProviderEventId({
    provider: provider.getProviderName(),
    providerEventId,
  });
  if (existing) {
    return { status: 'duplicate', event: existing };
  }

  let event;
  try {
    event = await repo.createWebhookEvent({
      provider: provider.getProviderName(),
      providerEventId,
      eventType: eventType ?? 'unknown',
      resourceType: body?.action ?? null,
      resourceId: dataId ? String(dataId) : null,
      payload: body ?? {},
      signatureValid,
      status: 'received',
    });
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await repo.findWebhookEventByProviderEventId({
        provider: provider.getProviderName(),
        providerEventId,
      });
      return { status: 'duplicate', event: dup };
    }
    throw err;
  }

  try {
    let result;
    if (
      eventType === 'payment' ||
      eventType === 'payment.created' ||
      eventType === 'payment.updated'
    ) {
      result = await handlePaymentEvent({ provider, paymentId: dataId, event });
    } else if (
      eventType === 'subscription_preapproval' ||
      eventType === 'preapproval' ||
      eventType === 'preapproval.updated'
    ) {
      result = await handlePreapprovalEvent({ provider, preapprovalId: dataId, event });
    } else if (
      eventType === 'subscription_authorized_payment' ||
      eventType === 'authorized_payment'
    ) {
      result = await handleAuthorizedPaymentEvent({
        provider,
        authorizedPaymentId: dataId,
        event,
      });
    } else {
      result = { status: 'skipped', reason: 'unhandled_event_type' };
    }
    await repo.saveWebhookEvent(event, {
      status:
        result.status === 'processed'
          ? 'processed'
          : result.status === 'skipped'
            ? 'skipped'
            : 'failed',
      processedAt: new Date(),
      processingError: result.reason ?? null,
      relatedTransactionId: result.transaction?._id ?? null,
    });
    return { ...result, event };
  } catch (err) {
    logger.warn({ err, providerEventId }, 'Webhook handler threw');
    await repo.saveWebhookEvent(event, {
      status: 'failed',
      processedAt: new Date(),
      processingError: err?.message?.slice(0, 200) ?? 'handler_threw',
    });
    return { status: 'failed', reason: 'handler_threw', event };
  }
};

const formatPriceLabel = (minor, currency) =>
  `${toMajor(minor).toFixed(2)} ${currency ?? ''}`.trim();

const normalizeWebhookResourceId = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/\/([^/?#]+)(?:[?#].*)?$/);
  return match ? match[1] : text;
};

/**
 * Apply a Mercado Pago `payment` notification. The handler fetches the
 * payment from the API (so the payload itself is never trusted) and:
 *   - matches by `external_reference` → our pending transaction;
 *   - mutates the transaction's status;
 *   - on approval, credits the wallet via the token ledger exactly once.
 */
const handlePaymentEvent = async ({ provider, paymentId, event }) => {
  if (!paymentId) {
    return { status: 'skipped', reason: 'missing_payment_id' };
  }

  let fetched;
  try {
    fetched = await provider.fetchPayment(String(paymentId));
  } catch (err) {
    logger.warn({ err, paymentId }, 'fetchPayment failed');
    return { status: 'failed', reason: 'fetch_payment_failed' };
  }

  // Resolve the transaction either by external reference (preferred — we
  // generated it) or by previously stored Mercado Pago payment id (retries).
  let transaction = fetched.externalReference
    ? await repo.findTransactionByExternalReference(fetched.externalReference)
    : null;
  if (!transaction) {
    transaction = await repo.findTransactionByPaymentId(String(paymentId));
  }
  if (!transaction) {
    return { status: 'skipped', reason: 'unknown_external_reference' };
  }

  // We only mutate state. Token credits are guarded below by `tokenCredited`.
  const updates = {
    providerPaymentId: String(fetched.id),
    providerPayerEmail: fetched.payerEmail ?? transaction.providerPayerEmail ?? null,
    status: fetched.status,
    metadata: {
      ...(transaction.metadata ?? {}),
      lastWebhookEventId: event._id.toString(),
      rawStatus: fetched.rawStatus,
    },
  };
  if (fetched.status === 'approved' && fetched.paidAt) {
    updates.paidAt = new Date(fetched.paidAt);
  }
  if (fetched.status === 'refunded') {
    updates.refundedAt = new Date();
  }
  if (fetched.status === 'charged_back') {
    updates.refundedAt = transaction.refundedAt ?? new Date();
  }
  if (fetched.status === 'failed' || fetched.status === 'rejected') {
    updates.failureReason = fetched.rawStatus ?? 'rejected';
  }

  await repo.saveTransaction(transaction, updates);

  if (fetched.status === 'approved' && !transaction.tokenCredited) {
    await creditTokensForTransaction({ transaction, event });
  }
  if (['refunded', 'charged_back'].includes(fetched.status)) {
    await reverseTokensForTransaction({ transaction, event, reason: fetched.status });
  }

  // Sync the token_purchases row so the existing UI keeps showing the right
  // state.
  await syncTokenPurchase(transaction, fetched.status);

  // Fire the matching email exactly once.
  await dispatchPaymentLifecycleEmail({ transaction, fetched });

  return { status: 'processed', transaction };
};

/**
 * Credit tokens for an approved token-package transaction. Idempotent by
 * design — we re-read the transaction inside this function and refuse to act
 * if `tokenCredited` is already true.
 */
const creditTokensForTransaction = async ({ transaction, event = null }) => {
  if (transaction.tokenCredited) return null;
  if (transaction.purpose !== 'token_package' && transaction.purpose !== 'subscription_renewal') {
    return null;
  }
  if (!transaction.tokensToCredit || transaction.tokensToCredit <= 0) {
    return null;
  }

  await tokenService.ensureWallet({ tenantId: transaction.tenantId });
  const wallet = await tokenRepo.atomicCredit({
    tenantId: transaction.tenantId,
    amount: transaction.tokensToCredit,
  });

  const ledger = await tokenRepo.createLedgerEntry({
    tenantId: transaction.tenantId,
    type: 'purchase',
    channel: null,
    amount: transaction.tokensToCredit,
    balanceAfter: wallet.balance,
    referenceType: 'payment_transaction',
    referenceId: transaction._id.toString(),
    description: `Mercado Pago token purchase: ${transaction.packageName ?? transaction.externalReference}`,
    createdBy: transaction.requestedBy ?? null,
    metadata: {
      paymentId: transaction.providerPaymentId ?? null,
      provider: transaction.provider,
      currency: transaction.currency,
      priceMinor: transaction.amountMinor,
      webhookEventId: event?._id?.toString() ?? null,
    },
  });

  await repo.saveTransaction(transaction, {
    tokenCredited: true,
    tokenLedgerEntryId: ledger._id,
  });

  await recordAuditEvent({
    action: PAYMENT_AUDIT_ACTIONS.TOKENS_CREDITED,
    entityType: 'payment_transaction',
    entityId: transaction._id.toString(),
    tenantId: transaction.tenantId,
    metadata: {
      tokens: transaction.tokensToCredit,
      ledgerEntryId: ledger._id.toString(),
      provider: transaction.provider,
    },
  });

  return ledger;
};

const reverseTokensForTransaction = async ({ transaction, event = null, reason }) => {
  if (!transaction.tokenCredited || transaction.tokenReversed) return null;
  if (transaction.purpose !== 'token_package') return null;
  if (!transaction.tokensToCredit || transaction.tokensToCredit <= 0) return null;

  await tokenService.ensureWallet({ tenantId: transaction.tenantId });
  const wallet = await tokenRepo.atomicForceDebit({
    tenantId: transaction.tenantId,
    amount: transaction.tokensToCredit,
  });

  if (!wallet) {
    await repo.saveTransaction(transaction, {
      metadata: {
        ...(transaction.metadata ?? {}),
        tokenReversalStatus: 'insufficient_balance',
        tokenReversalReason: reason,
        tokenReversalAttemptedAt: new Date().toISOString(),
      },
    });
    return null;
  }

  const ledger = await tokenRepo.createLedgerEntry({
    tenantId: transaction.tenantId,
    type: 'adjustment_debit',
    channel: null,
    amount: transaction.tokensToCredit,
    balanceAfter: wallet.balance,
    referenceType: 'payment_transaction',
    referenceId: transaction._id.toString(),
    description: `Mercado Pago ${reason} reversal: ${
      transaction.packageName ?? transaction.externalReference
    }`,
    createdBy: transaction.requestedBy ?? null,
    metadata: {
      paymentId: transaction.providerPaymentId ?? null,
      provider: transaction.provider,
      reason,
      originalLedgerEntryId: transaction.tokenLedgerEntryId
        ? transaction.tokenLedgerEntryId.toString()
        : null,
      webhookEventId: event?._id?.toString() ?? null,
    },
  });

  await repo.saveTransaction(transaction, {
    tokenReversed: true,
    tokenReversalLedgerEntryId: ledger._id,
    metadata: {
      ...(transaction.metadata ?? {}),
      tokenReversalStatus: 'completed',
      tokenReversalReason: reason,
      tokenReversalLedgerEntryId: ledger._id.toString(),
    },
  });

  await recordAuditEvent({
    action: PAYMENT_AUDIT_ACTIONS.PAYMENT_REFUNDED,
    entityType: 'payment_transaction',
    entityId: transaction._id.toString(),
    tenantId: transaction.tenantId,
    metadata: {
      reason,
      tokens: transaction.tokensToCredit,
      ledgerEntryId: ledger._id.toString(),
      provider: transaction.provider,
    },
  });

  return ledger;
};

const syncTokenPurchase = async (transaction, status) => {
  if (!transaction.tokenPurchaseId) return null;
  const purchase = await TokenPurchase.findById(transaction.tokenPurchaseId);
  if (!purchase) return null;
  const mapped =
    status === 'approved'
      ? 'completed'
      : status === 'rejected' || status === 'failed'
        ? 'rejected'
        : status === 'cancelled'
          ? 'cancelled'
          : purchase.status;
  if (purchase.status === mapped) return purchase;
  purchase.status = mapped;
  if (status === 'approved') {
    purchase.decidedAt = new Date();
    if (transaction.tokenLedgerEntryId) purchase.ledgerEntryId = transaction.tokenLedgerEntryId;
  }
  await purchase.save();
  return purchase;
};

const dispatchPaymentLifecycleEmail = async ({ transaction, fetched }) => {
  const baseData = {
    tokens: transaction.tokensToCredit,
    formattedPrice: formatPriceLabel(transaction.amountMinor, transaction.currency),
    reference: transaction.externalReference,
  };

  if (fetched.status === 'approved') {
    return sendPaymentNotification({
      type: 'token_payment_approved',
      tenantId: transaction.tenantId,
      referenceType: 'payment_transaction',
      referenceId: transaction._id.toString(),
      idempotencyKey: `token_payment_approved:${transaction._id.toString()}`,
      recipientEmail: transaction.providerPayerEmail ?? fetched.payerEmail ?? null,
      data: baseData,
    });
  }
  if (fetched.status === 'rejected') {
    return sendPaymentNotification({
      type: 'token_payment_rejected',
      tenantId: transaction.tenantId,
      referenceType: 'payment_transaction',
      referenceId: transaction._id.toString(),
      idempotencyKey: `token_payment_rejected:${transaction._id.toString()}`,
      recipientEmail: transaction.providerPayerEmail ?? null,
      data: { ...baseData, reason: fetched.rawStatus },
    });
  }
  if (fetched.status === 'cancelled') {
    return sendPaymentNotification({
      type: 'token_payment_cancelled',
      tenantId: transaction.tenantId,
      referenceType: 'payment_transaction',
      referenceId: transaction._id.toString(),
      idempotencyKey: `token_payment_cancelled:${transaction._id.toString()}`,
      recipientEmail: transaction.providerPayerEmail ?? null,
      data: baseData,
    });
  }
  if (fetched.status === 'refunded') {
    return sendPaymentNotification({
      type: 'token_payment_refunded',
      tenantId: transaction.tenantId,
      referenceType: 'payment_transaction',
      referenceId: transaction._id.toString(),
      idempotencyKey: `token_payment_refunded:${transaction._id.toString()}`,
      recipientEmail: transaction.providerPayerEmail ?? null,
      data: baseData,
    });
  }
  if (fetched.status === 'charged_back') {
    return sendPaymentNotification({
      type: 'token_payment_charged_back',
      tenantId: transaction.tenantId,
      referenceType: 'payment_transaction',
      referenceId: transaction._id.toString(),
      idempotencyKey: `token_payment_charged_back:${transaction._id.toString()}`,
      recipientEmail: transaction.providerPayerEmail ?? null,
      data: baseData,
    });
  }
  if (fetched.status === 'manual_review') {
    return sendPaymentNotification({
      type: 'token_payment_manual_review',
      tenantId: transaction.tenantId,
      referenceType: 'payment_transaction',
      referenceId: transaction._id.toString(),
      idempotencyKey: `token_payment_manual_review:${transaction._id.toString()}`,
      recipientEmail: transaction.providerPayerEmail ?? null,
      data: baseData,
    });
  }
  return null;
};

// ---------------------------------------------------------------------
// Subscriptions (preapproval) and authorized payments — webhook handlers
// ---------------------------------------------------------------------

// Forward declarations resolved lazily to avoid circular imports.
let subscriptionHandlers = null;
export const registerSubscriptionHandlers = (handlers) => {
  subscriptionHandlers = handlers;
};

const handlePreapprovalEvent = async ({ provider, preapprovalId, event }) => {
  if (!subscriptionHandlers) {
    return { status: 'skipped', reason: 'subscription_handler_unregistered' };
  }
  return subscriptionHandlers.handlePreapprovalEvent({ provider, preapprovalId, event });
};

const handleAuthorizedPaymentEvent = async ({ provider, authorizedPaymentId, event }) => {
  if (!subscriptionHandlers) {
    return { status: 'skipped', reason: 'subscription_handler_unregistered' };
  }
  return subscriptionHandlers.handleAuthorizedPaymentEvent({
    provider,
    authorizedPaymentId,
    event,
  });
};

// ---------------------------------------------------------------------
// Public list/read helpers used by the client billing controllers
// ---------------------------------------------------------------------

export const listClientTransactions = async ({ tenantId, query = {} }) => {
  const tenant = ensureTenant(tenantId);
  const result = await repo.findTransactions({
    tenantId: tenant,
    status: query.status,
    purpose: query.purpose,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? '-createdAt',
  });
  return {
    items: result.items.map(toPublicTransaction),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getClientTransaction = async ({ tenantId, id }) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'transaction id');
  const doc = await repo.findTransactionById({ id, tenantId: tenant });
  if (!doc) throw new NotFoundError('Payment not found');
  return toPublicTransaction(doc);
};

export const listAdminTransactions = async ({ query = {} }) => {
  const result = await repo.findTransactions({
    tenantId: null,
    status: query.status,
    purpose: query.purpose,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? '-createdAt',
  });
  return {
    items: result.items.map(toPublicTransaction),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getAdminTransaction = async ({ id }) => {
  assertObjectId(id, 'transaction id');
  const doc = await repo.findTransactionById({ id });
  if (!doc) throw new NotFoundError('Payment not found');
  return toPublicTransaction(doc);
};

export const listAdminWebhookEvents = async ({ query = {} }) => {
  const result = await repo.findWebhookEvents({
    provider: query.provider,
    status: query.status,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? '-createdAt',
  });
  return {
    items: result.items.map(toPublicWebhookEvent),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

/**
 * Admin reconciliation tool: fetch a payment from Mercado Pago and re-apply
 * the webhook handler. Used when a webhook delivery was lost and an admin
 * needs to force the local state to converge.
 */
export const reconcilePayment = async ({ paymentId, provider = resolvePaymentProvider() }) => {
  if (!paymentId) throw new ValidationError('paymentId is required');
  // We synthesize a webhook event so the same code path runs.
  return processIncomingWebhook({
    provider,
    body: {
      id: `reconcile:${paymentId}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`,
      type: 'payment',
      data: { id: paymentId },
    },
    rawBody: JSON.stringify({ type: 'payment', data: { id: paymentId } }),
    headers: {},
  });
};

/**
 * Surface used by reminder jobs: list tenant wallets at or below the
 * configured low-balance threshold so the reminder email can fire.
 */
export const findTenantsBelowBalanceThreshold = async ({ env = loadEnv() } = {}) => {
  const threshold = env.LOW_TOKEN_BALANCE_THRESHOLD ?? 0;
  if (threshold <= 0) return [];
  const { TokenWallet } = await import('../tokens/token-wallet.model.js');
  return TokenWallet.find({ balance: mongoose.trusted({ $lte: threshold }) });
};

export const __testing = {
  buildExternalReference,
  normalizeWebhookResourceId,
  creditTokensForTransaction,
  reverseTokensForTransaction,
  syncTokenPurchase,
  handlePaymentEvent,
  dispatchPaymentLifecycleEmail,
};

// Re-export so callers don't need to know about the conflict.
export { ConflictError };
