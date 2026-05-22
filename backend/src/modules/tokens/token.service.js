import mongoose from 'mongoose';

import * as repo from './token.repository.js';
import { currentYearMonth } from './monthly-send-usage.model.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { loadEnv } from '../../config/env.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export const TOKEN_AUDIT_ACTIONS = Object.freeze({
  PACKAGE_CREATED: 'tokens.package.created',
  PACKAGE_UPDATED: 'tokens.package.updated',
  PACKAGE_STATUS_CHANGED: 'tokens.package.status_changed',
  CHANNEL_PRICING_UPDATED: 'tokens.channel_pricing.updated',
  SEND_LIMITS_UPDATED: 'tokens.send_limits.updated',
  ADJUSTMENT_CREDIT: 'tokens.adjustment.credit',
  ADJUSTMENT_DEBIT: 'tokens.adjustment.debit',
  PURCHASE_REQUESTED: 'tokens.purchase.requested',
  PURCHASE_APPROVED: 'tokens.purchase.approved',
  PURCHASE_REJECTED: 'tokens.purchase.rejected',
});

export const CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);

const VALID_FAILED_POLICIES = Object.freeze(['refund', 'charge', 'hold']);

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

// Public DTO converters ------------------------------------------------

export const toPublicWallet = (wallet) => ({
  id: wallet._id?.toString() ?? null,
  tenantId: wallet.tenantId?.toString() ?? null,
  balance: wallet.balance,
  lifetimeCredited: wallet.lifetimeCredited ?? 0,
  lifetimeDebited: wallet.lifetimeDebited ?? 0,
  lifetimeRefunded: wallet.lifetimeRefunded ?? 0,
  lastEventAt: wallet.lastEventAt ?? null,
  updatedAt: wallet.updatedAt,
  createdAt: wallet.createdAt,
});

export const toPublicLedgerEntry = (entry) => ({
  id: entry._id.toString(),
  tenantId: entry.tenantId.toString(),
  type: entry.type,
  channel: entry.channel ?? null,
  amount: entry.amount,
  balanceAfter: entry.balanceAfter,
  referenceType: entry.referenceType,
  referenceId: entry.referenceId ?? null,
  description: entry.description ?? null,
  createdBy: entry.createdBy ? entry.createdBy.toString() : null,
  metadata: entry.metadata ?? {},
  createdAt: entry.createdAt,
});

export const toPublicPackage = (pkg) => ({
  id: pkg._id.toString(),
  name: pkg.name,
  description: pkg.description ?? null,
  tokens: pkg.tokens,
  priceMinor: pkg.priceMinor,
  currency: pkg.currency,
  status: pkg.status,
  sortOrder: pkg.sortOrder ?? 0,
  createdAt: pkg.createdAt,
  updatedAt: pkg.updatedAt,
});

export const toPublicChannelPricing = (rule) => ({
  channel: rule.channel,
  tokensPerRecipient: rule.tokensPerRecipient,
  status: rule.status,
  effectiveFrom: rule.effectiveFrom,
  updatedAt: rule.updatedAt,
});

export const toPublicSendLimits = (limit) => ({
  tenantId: limit.tenantId?.toString() ?? null,
  monthlyTotal: limit.monthlyTotal ?? null,
  monthlyPerChannel: {
    email: limit.monthlyPerChannel?.email ?? null,
    sms: limit.monthlyPerChannel?.sms ?? null,
    whatsapp: limit.monthlyPerChannel?.whatsapp ?? null,
  },
  enforcement: limit.enforcement ?? 'hard',
  notes: limit.notes ?? null,
  updatedAt: limit.updatedAt ?? null,
});

export const toPublicPurchase = (purchase) => ({
  id: purchase._id.toString(),
  tenantId: purchase.tenantId.toString(),
  packageId: purchase.packageId ? purchase.packageId.toString() : null,
  packageName: purchase.packageName,
  tokens: purchase.tokens,
  priceMinor: purchase.priceMinor,
  currency: purchase.currency,
  status: purchase.status,
  paymentProvider: purchase.paymentProvider ?? null,
  paymentReference: purchase.paymentReference ?? null,
  requestedBy: purchase.requestedBy ? purchase.requestedBy.toString() : null,
  decidedBy: purchase.decidedBy ? purchase.decidedBy.toString() : null,
  decidedAt: purchase.decidedAt ?? null,
  decisionNotes: purchase.decisionNotes ?? null,
  notes: purchase.notes ?? null,
  ledgerEntryId: purchase.ledgerEntryId ? purchase.ledgerEntryId.toString() : null,
  createdAt: purchase.createdAt,
  updatedAt: purchase.updatedAt,
});

export const toPublicMonthlyUsage = (usage) => ({
  tenantId: usage.tenantId.toString(),
  yearMonth: usage.yearMonth,
  total: usage.total ?? 0,
  perChannel: {
    email: usage.perChannel?.email ?? 0,
    sms: usage.perChannel?.sms ?? 0,
    whatsapp: usage.perChannel?.whatsapp ?? 0,
  },
});

// Wallet / balance helpers --------------------------------------------

export const ensureWallet = async ({ tenantId, env = loadEnv() }) => {
  const tenant = ensureTenant(tenantId);
  return repo.upsertWallet({ tenantId: tenant, initialBalance: env.DEFAULT_TOKEN_BALANCE ?? 0 });
};

export const getBalance = async ({ tenantId }) => {
  const wallet = await ensureWallet({ tenantId });
  return toPublicWallet(wallet);
};

// Channel pricing -----------------------------------------------------

const pricingDefaults = (env = loadEnv()) => ({
  email: env.DEFAULT_EMAIL_TOKEN_COST,
  sms: env.DEFAULT_SMS_TOKEN_COST,
  whatsapp: env.DEFAULT_WHATSAPP_TOKEN_COST,
});

export const getPricingMap = async ({ env = loadEnv() } = {}) => {
  const defaults = pricingDefaults(env);
  const rules = await repo.findChannelPricingRules();
  const map = { ...defaults };
  for (const rule of rules) {
    if (rule.status === 'active') {
      map[rule.channel] = rule.tokensPerRecipient;
    }
  }
  return map;
};

export const listChannelPricing = async ({ env = loadEnv() } = {}) => {
  const map = await getPricingMap({ env });
  const rules = await repo.findChannelPricingRules();
  const ruleByChannel = new Map(rules.map((r) => [r.channel, r]));
  return CHANNELS.map((channel) => {
    const rule = ruleByChannel.get(channel);
    if (rule) return toPublicChannelPricing(rule);
    return {
      channel,
      tokensPerRecipient: map[channel],
      status: 'default',
      effectiveFrom: null,
      updatedAt: null,
    };
  });
};

export const updateChannelPricing = async ({
  channel,
  tokensPerRecipient,
  actor,
  ip = null,
  userAgent = null,
}) => {
  if (!CHANNELS.includes(channel)) {
    throw new ValidationError(`Unsupported channel: ${channel}`);
  }
  if (!Number.isInteger(tokensPerRecipient) || tokensPerRecipient < 1) {
    throw new ValidationError('tokensPerRecipient must be a positive integer');
  }
  const updated = await repo.upsertChannelPricingRule({
    channel,
    tokensPerRecipient,
    updatedBy: actor?.id ?? null,
  });
  await recordAuditEvent({
    action: TOKEN_AUDIT_ACTIONS.CHANNEL_PRICING_UPDATED,
    entityType: 'channel_pricing',
    entityId: channel,
    userId: actor?.id ?? null,
    metadata: { channel, tokensPerRecipient },
    ip,
    userAgent,
  });
  return toPublicChannelPricing(updated);
};

// Send limits ---------------------------------------------------------

export const getTenantSendLimits = async ({ tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const doc = await repo.findTenantSendLimit(tenant);
  if (!doc) {
    return {
      tenantId: tenant,
      monthlyTotal: null,
      monthlyPerChannel: { email: null, sms: null, whatsapp: null },
      enforcement: 'hard',
      notes: null,
      updatedAt: null,
    };
  }
  return toPublicSendLimits(doc);
};

export const updateTenantSendLimits = async ({
  tenantId,
  monthlyTotal,
  monthlyPerChannel = {},
  enforcement = 'hard',
  notes = null,
  actor,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(tenant, 'tenant id');
  if (!['hard', 'soft'].includes(enforcement)) {
    throw new ValidationError('enforcement must be hard or soft');
  }
  const normalised = {
    monthlyTotal: monthlyTotal ?? null,
    monthlyPerChannel: {
      email: monthlyPerChannel?.email ?? null,
      sms: monthlyPerChannel?.sms ?? null,
      whatsapp: monthlyPerChannel?.whatsapp ?? null,
    },
    enforcement,
    notes,
  };
  const updated = await repo.upsertTenantSendLimit({
    tenantId: tenant,
    ...normalised,
    updatedBy: actor?.id ?? null,
  });
  await recordAuditEvent({
    action: TOKEN_AUDIT_ACTIONS.SEND_LIMITS_UPDATED,
    entityType: 'tenant_send_limits',
    entityId: tenant,
    userId: actor?.id ?? null,
    tenantId: tenant,
    metadata: normalised,
    ip,
    userAgent,
  });
  return toPublicSendLimits(updated);
};

export const getMonthlyUsage = async ({ tenantId, yearMonth = currentYearMonth() }) => {
  const tenant = ensureTenant(tenantId);
  const doc = await repo.findMonthlySendUsage({ tenantId: tenant, yearMonth });
  if (!doc) {
    return {
      tenantId: tenant,
      yearMonth,
      total: 0,
      perChannel: { email: 0, sms: 0, whatsapp: 0 },
    };
  }
  return toPublicMonthlyUsage(doc);
};

// Preflight / atomic debit --------------------------------------------

/**
 * Computes the cost of a campaign send given the planned recipient counts
 * per channel, and checks both balance and tenant send limits. Returns a
 * structured result so callers can either throw on `allowed: false` or
 * reflect the reason back to the user.
 *
 * Notes:
 *   - Counts must already exclude skipped recipients (skipped recipients do
 *     not consume tokens or send limits).
 *   - Soft limits never set `allowed: false`; they only populate
 *     `limitWarnings` so the caller can surface them in metadata.
 */
export const preflightCampaignSend = async ({
  tenantId,
  channelCounts,
  env = loadEnv(),
}) => {
  const tenant = ensureTenant(tenantId);
  const pricing = await getPricingMap({ env });
  const limits = await getTenantSendLimits({ tenantId: tenant });
  const usage = await getMonthlyUsage({ tenantId: tenant });
  const wallet = await ensureWallet({ tenantId: tenant, env });

  const perChannelCost = {};
  let totalCost = 0;
  for (const channel of CHANNELS) {
    const count = channelCounts?.[channel] ?? 0;
    const cost = count * (pricing[channel] ?? 0);
    perChannelCost[channel] = { count, tokensPerRecipient: pricing[channel] ?? 0, cost };
    totalCost += cost;
  }

  const limitViolations = [];
  const limitWarnings = [];
  for (const channel of CHANNELS) {
    const channelLimit = limits.monthlyPerChannel?.[channel];
    const channelCount = channelCounts?.[channel] ?? 0;
    if (channelLimit !== null && channelLimit !== undefined) {
      const projected = (usage.perChannel?.[channel] ?? 0) + channelCount;
      if (projected > channelLimit) {
        limitViolations.push({
          scope: 'channel',
          channel,
          limit: channelLimit,
          currentUsage: usage.perChannel?.[channel] ?? 0,
          requested: channelCount,
          projected,
        });
      }
    }
  }
  if (limits.monthlyTotal !== null && limits.monthlyTotal !== undefined) {
    const totalRequested = Object.values(channelCounts ?? {}).reduce((s, n) => s + (n ?? 0), 0);
    const projected = (usage.total ?? 0) + totalRequested;
    if (projected > limits.monthlyTotal) {
      limitViolations.push({
        scope: 'total',
        limit: limits.monthlyTotal,
        currentUsage: usage.total ?? 0,
        requested: totalRequested,
        projected,
      });
    }
  }

  const insufficientBalance = wallet.balance < totalCost;

  let allowed = true;
  const reasons = [];
  if (insufficientBalance) {
    allowed = false;
    reasons.push({ code: 'insufficient_balance', required: totalCost, balance: wallet.balance });
  }
  if (limitViolations.length > 0) {
    if (limits.enforcement === 'hard') {
      allowed = false;
      for (const v of limitViolations) reasons.push({ code: 'send_limit_exceeded', ...v });
    } else {
      for (const v of limitViolations) limitWarnings.push({ code: 'send_limit_exceeded', ...v });
    }
  }

  return {
    tenantId: tenant,
    allowed,
    pricing,
    perChannelCost,
    totalCost,
    balance: wallet.balance,
    limits,
    usage,
    reasons,
    limitWarnings,
  };
};

/**
 * Atomically debits the wallet for a single recipient and records an
 * immutable ledger entry. Returns `{ debited: true, entry, balanceAfter }`
 * on success, or `{ debited: false, reason: 'insufficient_balance' }` if
 * the conditional update did not match (race with another concurrent send).
 *
 * The caller is expected to flip the recipient to `failed` with the reason
 * when `debited: false`.
 */
export const debitForRecipient = async ({
  tenantId,
  recipientId,
  campaignId,
  channel,
  tokensPerRecipient,
  actor = null,
  metadata = {},
  eventAt = new Date(),
}) => {
  const tenant = ensureTenant(tenantId);
  if (!CHANNELS.includes(channel)) {
    throw new ValidationError(`Unsupported channel: ${channel}`);
  }
  if (!Number.isInteger(tokensPerRecipient) || tokensPerRecipient < 0) {
    throw new ValidationError('tokensPerRecipient must be a non-negative integer');
  }
  if (tokensPerRecipient === 0) {
    return { debited: true, entry: null, balanceAfter: null, skipped: true };
  }

  const wallet = await repo.atomicDebit({
    tenantId: tenant,
    amount: tokensPerRecipient,
    eventAt,
  });
  if (!wallet) {
    return { debited: false, reason: 'insufficient_balance' };
  }

  const entry = await repo.createLedgerEntry({
    tenantId: tenant,
    type: 'debit',
    channel,
    amount: tokensPerRecipient,
    balanceAfter: wallet.balance,
    referenceType: 'campaign_recipient',
    referenceId: recipientId ? recipientId.toString() : null,
    description: `Campaign send to ${channel}`,
    createdBy: actor?.id ?? null,
    metadata: {
      campaignId: campaignId ? campaignId.toString() : null,
      tokensPerRecipient,
      ...metadata,
    },
  });

  await repo.incrementMonthlySendUsage({ tenantId: tenant, channel, delta: 1 });

  return { debited: true, entry, balanceAfter: wallet.balance };
};

export const refundForRecipient = async ({
  tenantId,
  recipientId,
  campaignId,
  channel,
  amount,
  actor = null,
  reason = 'provider_failure',
  metadata = {},
  eventAt = new Date(),
}) => {
  const tenant = ensureTenant(tenantId);
  if (!Number.isInteger(amount) || amount < 0) {
    throw new ValidationError('amount must be a non-negative integer');
  }
  if (amount === 0) return { refunded: true, entry: null, balanceAfter: null, skipped: true };

  const wallet = await repo.atomicRefund({ tenantId: tenant, amount, eventAt });

  const entry = await repo.createLedgerEntry({
    tenantId: tenant,
    type: 'refund',
    channel,
    amount,
    balanceAfter: wallet.balance,
    referenceType: 'campaign_recipient',
    referenceId: recipientId ? recipientId.toString() : null,
    description: `Refund for ${channel} send (${reason})`,
    createdBy: actor?.id ?? null,
    metadata: {
      campaignId: campaignId ? campaignId.toString() : null,
      reason,
      ...metadata,
    },
  });

  if (channel) {
    await repo.incrementMonthlySendUsage({ tenantId: tenant, channel, delta: -1 });
  }
  return { refunded: true, entry, balanceAfter: wallet.balance };
};

export const resolveFailedSendPolicy = ({ env = loadEnv() } = {}) => {
  const policy = env.TOKEN_FAILED_SEND_POLICY;
  if (!VALID_FAILED_POLICIES.includes(policy)) return 'refund';
  return policy;
};

// Manual adjustments ---------------------------------------------------

export const adjustWallet = async ({
  tenantId,
  amount,
  direction,
  reason,
  actor,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(tenant, 'tenant id');
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('amount must be a positive integer');
  }
  if (!['credit', 'debit'].includes(direction)) {
    throw new ValidationError('direction must be credit or debit');
  }
  await ensureWallet({ tenantId: tenant });

  let wallet;
  let entryType;
  if (direction === 'credit') {
    wallet = await repo.atomicCredit({ tenantId: tenant, amount });
    entryType = 'adjustment_credit';
  } else {
    wallet = await repo.atomicForceDebit({ tenantId: tenant, amount });
    if (!wallet) {
      throw new ConflictError('Tenant balance is insufficient for this debit adjustment');
    }
    entryType = 'adjustment_debit';
  }

  const entry = await repo.createLedgerEntry({
    tenantId: tenant,
    type: entryType,
    channel: null,
    amount,
    balanceAfter: wallet.balance,
    referenceType: 'manual_adjustment',
    referenceId: null,
    description: reason ? reason.slice(0, 500) : null,
    createdBy: actor?.id ?? null,
    metadata: { reason: reason ?? null },
  });

  await recordAuditEvent({
    action:
      direction === 'credit'
        ? TOKEN_AUDIT_ACTIONS.ADJUSTMENT_CREDIT
        : TOKEN_AUDIT_ACTIONS.ADJUSTMENT_DEBIT,
    entityType: 'token_wallet',
    entityId: tenant,
    userId: actor?.id ?? null,
    tenantId: tenant,
    metadata: { amount, reason: reason ?? null, balanceAfter: wallet.balance },
    ip,
    userAgent,
  });

  return {
    wallet: toPublicWallet(wallet),
    entry: toPublicLedgerEntry(entry),
  };
};

// Token packages ------------------------------------------------------

export const listPackages = async ({ status, page, limit, sort } = {}) => {
  const result = await repo.findPackages({ status, page, limit, sort });
  return {
    items: result.items.map(toPublicPackage),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const createPackage = async ({ payload, actor, ip = null, userAgent = null }) => {
  const pkg = await repo.createPackage({
    ...payload,
    createdBy: actor?.id ?? null,
    updatedBy: actor?.id ?? null,
  });
  await recordAuditEvent({
    action: TOKEN_AUDIT_ACTIONS.PACKAGE_CREATED,
    entityType: 'token_package',
    entityId: pkg._id.toString(),
    userId: actor?.id ?? null,
    metadata: { name: pkg.name, tokens: pkg.tokens, priceMinor: pkg.priceMinor, currency: pkg.currency },
    ip,
    userAgent,
  });
  return toPublicPackage(pkg);
};

export const updatePackage = async ({ id, payload, actor, ip = null, userAgent = null }) => {
  assertObjectId(id, 'package id');
  const pkg = await repo.findPackageById(id);
  if (!pkg) throw new NotFoundError('Token package not found');
  await repo.updatePackage(pkg, { ...payload, updatedBy: actor?.id ?? null });
  await recordAuditEvent({
    action: TOKEN_AUDIT_ACTIONS.PACKAGE_UPDATED,
    entityType: 'token_package',
    entityId: pkg._id.toString(),
    userId: actor?.id ?? null,
    metadata: payload,
    ip,
    userAgent,
  });
  return toPublicPackage(pkg);
};

export const updatePackageStatus = async ({ id, status, actor, ip = null, userAgent = null }) => {
  assertObjectId(id, 'package id');
  if (!['active', 'inactive'].includes(status)) {
    throw new ValidationError('status must be active or inactive');
  }
  const pkg = await repo.findPackageById(id);
  if (!pkg) throw new NotFoundError('Token package not found');
  pkg.status = status;
  pkg.updatedBy = actor?.id ?? null;
  await pkg.save();
  await recordAuditEvent({
    action: TOKEN_AUDIT_ACTIONS.PACKAGE_STATUS_CHANGED,
    entityType: 'token_package',
    entityId: pkg._id.toString(),
    userId: actor?.id ?? null,
    metadata: { status },
    ip,
    userAgent,
  });
  return toPublicPackage(pkg);
};

// Ledger views --------------------------------------------------------

export const listLedger = async ({ tenantId, query = {} }) => {
  const tenant = tenantId ? ensureTenant(tenantId) : null;
  const result = await repo.findLedgerEntries({
    tenantId: tenant,
    type: query.type,
    channel: query.channel,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? '-createdAt',
  });
  return {
    items: result.items.map(toPublicLedgerEntry),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

// Token purchases -----------------------------------------------------

export const listPurchases = async ({ tenantId = null, status, page, limit, sort } = {}) => {
  const tenant = tenantId ? ensureTenant(tenantId) : null;
  const result = await repo.findPurchases({
    tenantId: tenant,
    status,
    page,
    limit,
    sort,
  });
  return {
    items: result.items.map(toPublicPurchase),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

/**
 * Client-side purchase request flow. When `TOKEN_PURCHASE_MODE=manual` (the
 * default) the purchase enters `pending` and waits for super admin approval.
 * A real payment provider can later short-circuit straight to `completed`
 * and credit the wallet, without changing the rest of the public API.
 */
export const requestPurchase = async ({
  tenantId,
  packageId,
  actor,
  notes = null,
  ip = null,
  userAgent = null,
  env = loadEnv(),
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(packageId, 'package id');
  const pkg = await repo.findPackageById(packageId);
  if (!pkg || pkg.status !== 'active') {
    throw new NotFoundError('Token package is not available');
  }
  const purchase = await repo.createPurchase({
    tenantId: tenant,
    packageId: pkg._id,
    packageName: pkg.name,
    tokens: pkg.tokens,
    priceMinor: pkg.priceMinor,
    currency: pkg.currency,
    status: 'pending',
    paymentProvider: env.TOKEN_PURCHASE_MODE === 'manual' ? null : env.TOKEN_PURCHASE_MODE,
    paymentReference: null,
    requestedBy: actor?.id ?? null,
    notes: notes ? notes.slice(0, 500) : null,
  });

  await recordAuditEvent({
    action: TOKEN_AUDIT_ACTIONS.PURCHASE_REQUESTED,
    entityType: 'token_purchase',
    entityId: purchase._id.toString(),
    userId: actor?.id ?? null,
    tenantId: tenant,
    metadata: {
      packageId: pkg._id.toString(),
      tokens: pkg.tokens,
      priceMinor: pkg.priceMinor,
      currency: pkg.currency,
    },
    ip,
    userAgent,
  });

  return toPublicPurchase(purchase);
};

export const approvePurchase = async ({
  id,
  actor,
  decisionNotes = null,
  ip = null,
  userAgent = null,
}) => {
  assertObjectId(id, 'purchase id');
  const purchase = await repo.findPurchaseById({ id });
  if (!purchase) throw new NotFoundError('Token purchase not found');
  if (purchase.status !== 'pending') {
    throw new ConflictError('Only pending purchases can be approved');
  }

  await ensureWallet({ tenantId: purchase.tenantId });
  const wallet = await repo.atomicCredit({
    tenantId: purchase.tenantId,
    amount: purchase.tokens,
  });

  const entry = await repo.createLedgerEntry({
    tenantId: purchase.tenantId,
    type: 'purchase',
    channel: null,
    amount: purchase.tokens,
    balanceAfter: wallet.balance,
    referenceType: 'token_purchase',
    referenceId: purchase._id.toString(),
    description: `Token purchase: ${purchase.packageName}`,
    createdBy: actor?.id ?? null,
    metadata: {
      packageId: purchase.packageId ? purchase.packageId.toString() : null,
      priceMinor: purchase.priceMinor,
      currency: purchase.currency,
    },
  });

  await repo.savePurchase(purchase, {
    status: 'completed',
    decidedBy: actor?.id ?? null,
    decidedAt: new Date(),
    decisionNotes: decisionNotes ? decisionNotes.slice(0, 500) : null,
    ledgerEntryId: entry._id,
  });

  await recordAuditEvent({
    action: TOKEN_AUDIT_ACTIONS.PURCHASE_APPROVED,
    entityType: 'token_purchase',
    entityId: purchase._id.toString(),
    userId: actor?.id ?? null,
    tenantId: purchase.tenantId,
    metadata: { tokens: purchase.tokens, ledgerEntryId: entry._id.toString() },
    ip,
    userAgent,
  });

  return {
    purchase: toPublicPurchase(purchase),
    wallet: toPublicWallet(wallet),
    ledgerEntry: toPublicLedgerEntry(entry),
  };
};

export const rejectPurchase = async ({
  id,
  actor,
  decisionNotes = null,
  ip = null,
  userAgent = null,
}) => {
  assertObjectId(id, 'purchase id');
  const purchase = await repo.findPurchaseById({ id });
  if (!purchase) throw new NotFoundError('Token purchase not found');
  if (purchase.status !== 'pending') {
    throw new ConflictError('Only pending purchases can be rejected');
  }
  await repo.savePurchase(purchase, {
    status: 'rejected',
    decidedBy: actor?.id ?? null,
    decidedAt: new Date(),
    decisionNotes: decisionNotes ? decisionNotes.slice(0, 500) : null,
  });
  await recordAuditEvent({
    action: TOKEN_AUDIT_ACTIONS.PURCHASE_REJECTED,
    entityType: 'token_purchase',
    entityId: purchase._id.toString(),
    userId: actor?.id ?? null,
    tenantId: purchase.tenantId,
    metadata: { reason: decisionNotes ?? null },
    ip,
    userAgent,
  });
  return toPublicPurchase(purchase);
};

export const getPurchase = async ({ id, tenantId = null }) => {
  assertObjectId(id, 'purchase id');
  const purchase = await repo.findPurchaseById({ id, tenantId });
  if (!purchase) throw new NotFoundError('Token purchase not found');
  return toPublicPurchase(purchase);
};

export const __testing = { pricingDefaults, assertObjectId };
