import { Plan } from '../modules/plans/plan.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { assignPlanToTenant } from '../modules/plans/plan.service.js';
import { FEATURE_KEYS, QUOTA_KEYS } from '../modules/plans/plan.constants.js';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from '../config/env.js';

const FREE_FEATURES = {
  [FEATURE_KEYS.CAMPAIGNS_EMAIL]: true,
  [FEATURE_KEYS.SURVEYS_PUBLISH]: true,
  [FEATURE_KEYS.MEDIA_UPLOAD]: true,
  [FEATURE_KEYS.TEMPLATES_CUSTOM]: true,
};

const PRO_FEATURES = {
  [FEATURE_KEYS.CAMPAIGNS_EMAIL]: true,
  [FEATURE_KEYS.CAMPAIGNS_SMS]: true,
  [FEATURE_KEYS.CAMPAIGNS_WHATSAPP]: true,
  [FEATURE_KEYS.SURVEYS_PUBLISH]: true,
  [FEATURE_KEYS.SURVEYS_ADVANCED_REPORTS]: true,
  [FEATURE_KEYS.SURVEYS_EXPORTS]: true,
  [FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING]: true,
  [FEATURE_KEYS.SURVEYS_WHITE_LABEL]: true,
  [FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS]: true,
  [FEATURE_KEYS.SURVEYS_CAPTCHA]: true,
  [FEATURE_KEYS.TEMPLATES_CUSTOM]: true,
  [FEATURE_KEYS.MEDIA_UPLOAD]: true,
  [FEATURE_KEYS.TEAM_INVITATIONS]: true,
  [FEATURE_KEYS.API_ACCESS]: true,
};

const ENTERPRISE_FEATURES = { ...PRO_FEATURES };

const FREE_QUOTAS = {
  [QUOTA_KEYS.USERS]: 3,
  [QUOTA_KEYS.SURVEYS]: 5,
  [QUOTA_KEYS.CONTACTS]: 250,
  [QUOTA_KEYS.TEMPLATES]: 3,
  [QUOTA_KEYS.STORAGE_MB]: 100,
  [QUOTA_KEYS.RESPONSES_MONTHLY]: 500,
  [QUOTA_KEYS.CAMPAIGNS_MONTHLY]: 5,
  [QUOTA_KEYS.EXPORTS_MONTHLY]: 5,
  [QUOTA_KEYS.REPORTS_MONTHLY]: 20,
};

const PRO_QUOTAS = {
  [QUOTA_KEYS.USERS]: 25,
  [QUOTA_KEYS.SURVEYS]: 100,
  [QUOTA_KEYS.CONTACTS]: 25_000,
  [QUOTA_KEYS.TEMPLATES]: 50,
  [QUOTA_KEYS.STORAGE_MB]: 5_000,
  [QUOTA_KEYS.RESPONSES_MONTHLY]: 25_000,
  [QUOTA_KEYS.CAMPAIGNS_MONTHLY]: 100,
  [QUOTA_KEYS.EXPORTS_MONTHLY]: 200,
  [QUOTA_KEYS.REPORTS_MONTHLY]: 1_000,
};

const ENTERPRISE_QUOTAS = {
  [QUOTA_KEYS.USERS]: null,
  [QUOTA_KEYS.SURVEYS]: null,
  [QUOTA_KEYS.CONTACTS]: null,
  [QUOTA_KEYS.TEMPLATES]: null,
  [QUOTA_KEYS.STORAGE_MB]: null,
  [QUOTA_KEYS.RESPONSES_MONTHLY]: null,
  [QUOTA_KEYS.CAMPAIGNS_MONTHLY]: null,
  [QUOTA_KEYS.EXPORTS_MONTHLY]: null,
  [QUOTA_KEYS.REPORTS_MONTHLY]: null,
};

const PLAN_DEFINITIONS = [
  {
    code: 'free',
    name: 'Free',
    description: 'Evaluation plan with limited usage caps.',
    status: 'active',
    isDefault: true,
    price: { amountMinor: 0, currency: 'USD', intervalUnit: 'months', intervalCount: 1 },
    features: FREE_FEATURES,
    quotas: FREE_QUOTAS,
    sortOrder: 10,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Higher limits and full multi-channel delivery for growing teams.',
    status: 'active',
    isDefault: false,
    price: { amountMinor: 4900, currency: 'USD', intervalUnit: 'months', intervalCount: 1 },
    features: PRO_FEATURES,
    quotas: PRO_QUOTAS,
    sortOrder: 20,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited usage, all features, and priority support.',
    status: 'active',
    isDefault: false,
    price: { amountMinor: 49_900, currency: 'USD', intervalUnit: 'months', intervalCount: 1 },
    features: ENTERPRISE_FEATURES,
    quotas: ENTERPRISE_QUOTAS,
    sortOrder: 30,
  },
];

const upsertPlan = async (def) => {
  let plan = await Plan.findOne({ code: def.code });
  if (!plan) {
    plan = await Plan.create(def);
    return { plan, created: true };
  }

  let dirty = false;
  if (plan.name !== def.name) {
    plan.name = def.name;
    dirty = true;
  }
  if (plan.description !== def.description) {
    plan.description = def.description;
    dirty = true;
  }
  if (plan.status !== def.status) {
    plan.status = def.status;
    dirty = true;
  }
  if (Boolean(plan.isDefault) !== Boolean(def.isDefault)) {
    plan.isDefault = Boolean(def.isDefault);
    dirty = true;
  }
  if (plan.sortOrder !== def.sortOrder) {
    plan.sortOrder = def.sortOrder;
    dirty = true;
  }
  // Always re-apply features and quotas so seeding stays the source of truth
  // for the catalogue shape in development.
  plan.features = def.features;
  plan.quotas = def.quotas;
  plan.price = def.price;
  dirty = true;

  if (dirty) await plan.save();
  return { plan, created: false };
};

/**
 * Idempotently seeds the Free / Pro / Enterprise plans and assigns the demo
 * tenant to the Pro plan so the local UI can showcase usage meters and
 * upgrade prompts.
 */
export const seedPlans = async () => {
  const env = loadEnv();
  const report = { plans: [], assignment: null };

  // Clear other defaults if one of the seeded plans claims it.
  if (PLAN_DEFINITIONS.some((p) => p.isDefault)) {
    await Plan.updateMany({ isDefault: true }, { $set: { isDefault: false } });
  }

  for (const def of PLAN_DEFINITIONS) {
    const result = await upsertPlan(def);
    report.plans.push({
      code: result.plan.code,
      created: result.created,
      id: result.plan._id.toString(),
    });
  }

  // Assign demo tenant to the Pro plan so the dashboard demo has data.
  const proPlan = await Plan.findOne({ code: 'pro' });
  const demoTenant = await Tenant.findOne({ name: env.DEMO_TENANT_NAME });
  if (proPlan && demoTenant) {
    const result = await assignPlanToTenant({
      tenantId: demoTenant._id.toString(),
      planId: proPlan._id.toString(),
      actor: null,
      source: 'system',
      reason: 'Seeded demo tenant',
    });
    report.assignment = {
      tenantId: demoTenant._id.toString(),
      planCode: 'pro',
      changed: result.changed,
    };
  }

  logger.info({ plans: report.plans, assignment: report.assignment }, 'Plans seed complete');
  return report;
};
