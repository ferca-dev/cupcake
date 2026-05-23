import mongoose from 'mongoose';

import { TokenWallet } from './token-wallet.model.js';
import { TokenLedgerEntry } from './token-ledger-entry.model.js';
import { TokenPackage } from './token-package.model.js';
import { ChannelPricingRule } from './channel-pricing.model.js';
import { TenantSendLimit } from './tenant-send-limit.model.js';
import { TokenPurchase } from './token-purchase.model.js';
import { MonthlySendUsage, currentYearMonth } from './monthly-send-usage.model.js';

const tenantFilter = (filter = {}, tenantId = null) =>
  tenantId ? { ...filter, tenantId } : filter;

// Wallet ---------------------------------------------------------------

export const findWallet = (tenantId) => TokenWallet.findOne({ tenantId });

export const upsertWallet = async ({ tenantId, initialBalance = 0 }) => {
  return TokenWallet.findOneAndUpdate(
    { tenantId },
    { $setOnInsert: { tenantId, balance: initialBalance } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

/**
 * Atomic conditional debit. Only succeeds if `balance >= amount`; returns
 * the updated wallet or `null` when the balance was insufficient.
 *
 * The conditional filter is wrapped in `mongoose.trusted` so the project-wide
 * `sanitizeFilter` setting does not strip the `$gte` operator (it would by
 * default, treating it as user-supplied input).
 */
export const atomicDebit = async ({ tenantId, amount, eventAt = new Date() }) => {
  return TokenWallet.findOneAndUpdate(
    { tenantId, balance: mongoose.trusted({ $gte: amount }) },
    { $inc: { balance: -amount, lifetimeDebited: amount }, $set: { lastEventAt: eventAt } },
    { new: true },
  );
};

export const atomicCredit = async ({ tenantId, amount, eventAt = new Date() }) => {
  return TokenWallet.findOneAndUpdate(
    { tenantId },
    { $inc: { balance: amount, lifetimeCredited: amount }, $set: { lastEventAt: eventAt } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

export const atomicRefund = async ({ tenantId, amount, eventAt = new Date() }) => {
  return TokenWallet.findOneAndUpdate(
    { tenantId },
    { $inc: { balance: amount, lifetimeRefunded: amount }, $set: { lastEventAt: eventAt } },
    { new: true },
  );
};

/**
 * Atomic, unconditional debit. Used for admin debit adjustments where the
 * balance may legitimately drop to zero but never below it; the caller is
 * responsible for checking balance before calling.
 */
export const atomicForceDebit = async ({ tenantId, amount, eventAt = new Date() }) => {
  return TokenWallet.findOneAndUpdate(
    { tenantId, balance: mongoose.trusted({ $gte: amount }) },
    { $inc: { balance: -amount, lifetimeDebited: amount }, $set: { lastEventAt: eventAt } },
    { new: true },
  );
};

// Ledger ---------------------------------------------------------------

export const createLedgerEntry = (payload) => TokenLedgerEntry.create(payload);

export const findLedgerEntries = async ({
  tenantId,
  type,
  channel,
  page = 1,
  limit = 25,
  sort = '-createdAt',
} = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (type) filter.type = type;
  if (channel) filter.channel = channel;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TokenLedgerEntry.find(filter).sort(sort).skip(skip).limit(limit),
    TokenLedgerEntry.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findLedgerEntryById = ({ id, tenantId = null }) =>
  TokenLedgerEntry.findOne(tenantFilter({ _id: id }, tenantId));

export const aggregateLedgerSums = async ({ tenantId, type }) => {
  const filter = tenantFilter({}, tenantId);
  if (type) filter.type = type;
  const result = await TokenLedgerEntry.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return result[0]?.total ?? 0;
};

// Packages -------------------------------------------------------------

export const findPackages = async ({ status, page = 1, limit = 50, sort = 'sortOrder' } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TokenPackage.find(filter).sort(sort).skip(skip).limit(limit),
    TokenPackage.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findPackageById = (id) => TokenPackage.findById(id);

export const createPackage = (payload) => TokenPackage.create(payload);

export const updatePackage = async (pkg, updates) => {
  Object.assign(pkg, updates);
  await pkg.save();
  return pkg;
};

// Channel pricing ------------------------------------------------------

export const findChannelPricingRules = () => ChannelPricingRule.find({}).sort('channel');

export const findChannelPricingRule = (channel) => ChannelPricingRule.findOne({ channel });

export const upsertChannelPricingRule = ({ channel, tokensPerRecipient, updatedBy }) =>
  ChannelPricingRule.findOneAndUpdate(
    { channel },
    {
      $set: {
        channel,
        tokensPerRecipient,
        status: 'active',
        effectiveFrom: new Date(),
        updatedBy,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

// Tenant send limits ---------------------------------------------------

export const findTenantSendLimit = (tenantId) => TenantSendLimit.findOne({ tenantId });

export const upsertTenantSendLimit = ({
  tenantId,
  monthlyTotal,
  monthlyPerChannel,
  enforcement,
  notes,
  updatedBy,
}) =>
  TenantSendLimit.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        monthlyTotal,
        monthlyPerChannel,
        enforcement,
        notes: notes ?? null,
        updatedBy,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

// Token purchases ------------------------------------------------------

export const createPurchase = (payload) => TokenPurchase.create(payload);

export const findPurchaseById = ({ id, tenantId = null }) =>
  TokenPurchase.findOne(tenantFilter({ _id: id }, tenantId));

export const findPurchases = async ({
  tenantId,
  status,
  page = 1,
  limit = 25,
  sort = '-createdAt',
} = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TokenPurchase.find(filter).sort(sort).skip(skip).limit(limit),
    TokenPurchase.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const savePurchase = async (purchase, updates) => {
  Object.assign(purchase, updates);
  await purchase.save();
  return purchase;
};

// Monthly send usage ---------------------------------------------------

export const findMonthlySendUsage = ({ tenantId, yearMonth = currentYearMonth() }) =>
  MonthlySendUsage.findOne({ tenantId, yearMonth });

export const incrementMonthlySendUsage = ({
  tenantId,
  channel,
  delta = 1,
  yearMonth = currentYearMonth(),
}) => {
  const update = { $inc: { total: delta } };
  update.$inc[`perChannel.${channel}`] = delta;
  return MonthlySendUsage.findOneAndUpdate({ tenantId, yearMonth }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
};
