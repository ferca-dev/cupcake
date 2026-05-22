import { Tenant } from '../modules/tenants/tenant.model.js';
import { User } from '../modules/users/user.model.js';
import { TokenWallet } from '../modules/tokens/token-wallet.model.js';
import { TokenLedgerEntry } from '../modules/tokens/token-ledger-entry.model.js';
import { TokenPackage } from '../modules/tokens/token-package.model.js';
import { ChannelPricingRule } from '../modules/tokens/channel-pricing.model.js';
import { TenantSendLimit } from '../modules/tokens/tenant-send-limit.model.js';
import { TokenPurchase } from '../modules/tokens/token-purchase.model.js';
import { slugify } from '../common/utils/slug.js';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from '../config/env.js';

const DEMO_SEED_TAG = 'demo-seed';

const DEMO_PACKAGES = [
  {
    name: 'Starter',
    description: '500 tokens for small sends.',
    tokens: 500,
    priceMinor: 4900,
    currency: 'USD',
    sortOrder: 1,
  },
  {
    name: 'Growth',
    description: '2,500 tokens with bonus volume.',
    tokens: 2_500,
    priceMinor: 19900,
    currency: 'USD',
    sortOrder: 2,
  },
  {
    name: 'Scale',
    description: '10,000 tokens for high-volume teams.',
    tokens: 10_000,
    priceMinor: 69900,
    currency: 'USD',
    sortOrder: 3,
  },
];

/**
 * Idempotent token seeder. Creates the default channel pricing rules, a few
 * demo packages, a starter wallet for the demo tenant, and a sample pending
 * purchase request so the admin approval flow has something to inspect.
 */
export const seedTokens = async () => {
  const env = loadEnv();

  // Channel pricing rules ---------------------------------------------
  for (const channel of ['email', 'sms', 'whatsapp']) {
    const tokensPerRecipient =
      channel === 'email'
        ? env.DEFAULT_EMAIL_TOKEN_COST
        : channel === 'sms'
          ? env.DEFAULT_SMS_TOKEN_COST
          : env.DEFAULT_WHATSAPP_TOKEN_COST;
    await ChannelPricingRule.findOneAndUpdate(
      { channel },
      {
        $setOnInsert: {
          channel,
          tokensPerRecipient,
          status: 'active',
          effectiveFrom: new Date(),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  // Token packages ----------------------------------------------------
  if ((await TokenPackage.countDocuments()) === 0) {
    await TokenPackage.insertMany(
      DEMO_PACKAGES.map((pkg) => ({
        ...pkg,
        description: `${DEMO_SEED_TAG} · ${pkg.description}`,
        status: 'active',
      })),
    );
  }

  // Demo tenant wallet + limits + sample purchase --------------------
  const tenantSlug = slugify(env.DEMO_TENANT_NAME);
  const tenant =
    (await Tenant.findOne({ slug: tenantSlug })) ??
    (await Tenant.findOne({ name: env.DEMO_TENANT_NAME }));
  if (!tenant) {
    logger.info('Demo tenant missing — skip token seed.');
    return { wallets: 0 };
  }

  const wallet = await TokenWallet.findOneAndUpdate(
    { tenantId: tenant._id },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        balance: 1000,
        lifetimeCredited: 1000,
        lastEventAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const ledgerExists = await TokenLedgerEntry.countDocuments({
    tenantId: tenant._id,
    referenceType: 'manual_adjustment',
  });
  if (ledgerExists === 0) {
    await TokenLedgerEntry.create({
      tenantId: tenant._id,
      type: 'adjustment_credit',
      channel: null,
      amount: 1000,
      balanceAfter: wallet.balance,
      referenceType: 'manual_adjustment',
      referenceId: null,
      description: `${DEMO_SEED_TAG} · starter credit`,
      metadata: { source: DEMO_SEED_TAG },
    });
  }

  await TenantSendLimit.findOneAndUpdate(
    { tenantId: tenant._id },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        monthlyTotal: 5000,
        monthlyPerChannel: { email: 4000, sms: 1500, whatsapp: 1000 },
        enforcement: 'hard',
        notes: `${DEMO_SEED_TAG} · default demo limits`,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  // A sample pending purchase so the admin approval queue is non-empty.
  if ((await TokenPurchase.countDocuments({ tenantId: tenant._id })) === 0) {
    const requester = await User.findOne({ email: env.DEMO_CLIENT_EMAIL.toLowerCase() });
    const starter = await TokenPackage.findOne({ name: 'Starter' });
    if (starter) {
      await TokenPurchase.create({
        tenantId: tenant._id,
        packageId: starter._id,
        packageName: starter.name,
        tokens: starter.tokens,
        priceMinor: starter.priceMinor,
        currency: starter.currency,
        status: 'pending',
        requestedBy: requester?._id ?? null,
        notes: `${DEMO_SEED_TAG} · awaiting approval`,
      });
    }
  }

  logger.info({ tenantId: tenant._id.toString() }, 'Token seed complete');
  return { wallets: 1 };
};
