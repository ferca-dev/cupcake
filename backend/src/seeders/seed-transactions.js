import { Tenant } from '../modules/tenants/tenant.model.js';
import { User } from '../modules/users/user.model.js';
import { Transaction } from '../modules/transactions/transaction.model.js';
import { slugify } from '../common/utils/slug.js';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from '../config/env.js';

const DEMO_SEED_TAG = 'demo-seed';

/**
 * Produces a deterministic past timestamp `monthsAgo` whole months before now.
 * Used so re-running the seeder lands on the same timeline.
 */
const monthsAgo = (count) => {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - count);
  return date;
};

/**
 * Idempotently inserts a small spread of demo transactions for the demo
 * tenant. Records are tagged through their `description` and `planCode` so
 * re-running the seeder does not duplicate them.
 *
 * No real provider is involved — `provider` is set to `null` so the UI can
 * render the history without implying any real charge took place.
 */
export const seedTransactions = async () => {
  const env = loadEnv();
  const tenantSlug = slugify(env.DEMO_TENANT_NAME);
  const tenant =
    (await Tenant.findOne({ slug: tenantSlug })) ??
    (await Tenant.findOne({ name: env.DEMO_TENANT_NAME }));
  if (!tenant) {
    logger.warn('Demo tenant missing — run seed-auth first');
    return { transactions: [] };
  }

  const initiator = await User.findOne({ email: env.DEMO_CLIENT_EMAIL.toLowerCase() });

  const existing = await Transaction.countDocuments({ tenantId: tenant._id });
  if (existing > 0) {
    return { transactions: [] };
  }

  const baseDoc = {
    tenantId: tenant._id,
    currency: 'USD',
    provider: null,
    initiatedBy: initiator?._id ?? null,
  };

  // Amounts are stored as integer minor units (cents). 4900 cents = $49.00.
  const demoTransactions = [
    {
      ...baseDoc,
      type: 'payment',
      status: 'paid',
      amount: 4900,
      planCode: 'pro_monthly',
      description: `${DEMO_SEED_TAG} · Pro plan monthly subscription`,
      paidAt: monthsAgo(3),
      createdAt: monthsAgo(3),
      updatedAt: monthsAgo(3),
    },
    {
      ...baseDoc,
      type: 'payment',
      status: 'paid',
      amount: 4900,
      planCode: 'pro_monthly',
      description: `${DEMO_SEED_TAG} · Pro plan monthly subscription`,
      paidAt: monthsAgo(2),
      createdAt: monthsAgo(2),
      updatedAt: monthsAgo(2),
    },
    {
      ...baseDoc,
      type: 'payment',
      status: 'paid',
      amount: 4900,
      planCode: 'pro_monthly',
      description: `${DEMO_SEED_TAG} · Pro plan monthly subscription`,
      paidAt: monthsAgo(1),
      createdAt: monthsAgo(1),
      updatedAt: monthsAgo(1),
    },
    {
      ...baseDoc,
      type: 'refund',
      status: 'refunded',
      amount: 1500,
      planCode: 'pro_monthly',
      description: `${DEMO_SEED_TAG} · Prorated refund (duplicate charge)`,
      paidAt: monthsAgo(1),
      createdAt: monthsAgo(1),
      updatedAt: monthsAgo(1),
    },
    {
      ...baseDoc,
      type: 'credit',
      status: 'paid',
      amount: 1000,
      planCode: null,
      description: `${DEMO_SEED_TAG} · Goodwill credit applied`,
      paidAt: monthsAgo(1),
      createdAt: monthsAgo(1),
      updatedAt: monthsAgo(1),
    },
    {
      ...baseDoc,
      type: 'payment',
      status: 'pending',
      amount: 4900,
      planCode: 'pro_monthly',
      description: `${DEMO_SEED_TAG} · Awaiting confirmation`,
      paidAt: null,
    },
    {
      ...baseDoc,
      type: 'payment',
      status: 'failed',
      amount: 4900,
      planCode: 'pro_monthly',
      description: `${DEMO_SEED_TAG} · Demo failure (mock data)`,
      paidAt: null,
    },
  ];

  // Use `insertMany` so the per-record `createdAt` overrides Mongoose's
  // automatic timestamp. `timestamps: { currentTime }` keeps the explicit
  // dates we provided.
  const inserted = await Transaction.insertMany(demoTransactions, {
    timestamps: false,
  });

  logger.info(
    { tenantId: tenant._id.toString(), count: inserted.length },
    'Transactions seed complete',
  );

  return { transactions: inserted };
};
