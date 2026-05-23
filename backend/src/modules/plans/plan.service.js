import mongoose from 'mongoose';

import { Plan } from './plan.model.js';
import * as repo from './plan.repository.js';
import {
  DEFAULT_PLAN,
  FEATURE_KEY_VALUES,
  QUOTA_KEY_VALUES,
  QUOTA_KEYS,
  QUOTA_DEFINITIONS,
  QUOTA_PERIODS,
  getQuotaPeriod,
  buildPeriodKey,
} from './plan.constants.js';
import { Tenant } from '../tenants/tenant.model.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export const PLAN_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'plan.created',
  UPDATED: 'plan.updated',
  STATUS_CHANGED: 'plan.status_changed',
  ASSIGNED: 'plan.assigned',
});

const ENTITY_PLAN = 'plan';
const ENTITY_ASSIGNMENT = 'plan_assignment';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const assertObjectId = (value, label = 'id') => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const sanitiseFeatures = (input = {}) => {
  const out = {};
  for (const key of FEATURE_KEY_VALUES) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = Boolean(input[key]);
    }
  }
  return out;
};

const sanitiseQuotas = (input = {}) => {
  const out = {};
  for (const key of QUOTA_KEY_VALUES) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (value === null || value === undefined || value === '') {
      out[key] = null;
    } else {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) {
        throw new ValidationError(`Quota '${key}' must be a non-negative number or null`);
      }
      out[key] = Math.floor(num);
    }
  }
  return out;
};

export const toPublicPlan = (plan) => {
  if (!plan) return null;
  if (plan.isFallback) {
    return {
      id: null,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      isDefault: true,
      isFallback: true,
      price: { ...plan.price },
      features: { ...plan.features },
      quotas: { ...plan.quotas },
      subscriptionPlanId: null,
      sortOrder: 0,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: plan._id.toString(),
    code: plan.code,
    name: plan.name,
    description: plan.description ?? null,
    status: plan.status,
    isDefault: Boolean(plan.isDefault),
    isFallback: false,
    price: {
      amountMinor: plan.price?.amountMinor ?? 0,
      currency: plan.price?.currency ?? 'USD',
      intervalUnit: plan.price?.intervalUnit ?? 'months',
      intervalCount: plan.price?.intervalCount ?? 1,
    },
    features: plan.normalizedFeatures(),
    quotas: plan.normalizedQuotas(),
    subscriptionPlanId: plan.subscriptionPlanId ? plan.subscriptionPlanId.toString() : null,
    sortOrder: plan.sortOrder ?? 0,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
};

const toPublicAssignment = (assignment) => ({
  id: assignment._id.toString(),
  tenantId: assignment.tenantId.toString(),
  planId: assignment.planId ? assignment.planId.toString() : null,
  planCode: assignment.planCodeSnapshot,
  planName: assignment.planNameSnapshot,
  features: { ...(assignment.featuresSnapshot ?? {}) },
  quotas: { ...(assignment.quotasSnapshot ?? {}) },
  assignedAt: assignment.assignedAt,
  replacedAt: assignment.replacedAt,
  assignedByUserId: assignment.assignedByUserId
    ? assignment.assignedByUserId.toString()
    : null,
  reason: assignment.reason ?? null,
  subscriptionId: assignment.subscriptionId
    ? assignment.subscriptionId.toString()
    : null,
  source: assignment.source ?? 'admin',
  createdAt: assignment.createdAt,
  updatedAt: assignment.updatedAt,
});

const audit = (action, { actor, entityType, entityId, tenantId = null, metadata = {} }) =>
  recordAuditEvent({
    action,
    entityType,
    entityId: entityId ? entityId.toString() : null,
    userId: actor?.id ?? null,
    tenantId,
    metadata,
  });

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const listPlans = async (query = {}) => {
  const result = await repo.findPlans(query);
  return {
    items: result.items.map((plan) => toPublicPlan(plan)),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const listActivePlans = async () => {
  const items = await repo.findActivePlans();
  return items.map((plan) => toPublicPlan(plan));
};

export const getPlan = async ({ id }) => {
  assertObjectId(id, 'plan id');
  const plan = await repo.findPlanById(id);
  if (!plan) throw new NotFoundError('Plan not found');
  return toPublicPlan(plan);
};

export const createPlan = async ({ payload, actor }) => {
  const existing = await repo.findPlanByCode(payload.code);
  if (existing) {
    throw new ConflictError('A plan with this code already exists', [
      { path: ['code'], message: 'Code is already in use' },
    ]);
  }

  const features = sanitiseFeatures(payload.features ?? {});
  const quotas = sanitiseQuotas(payload.quotas ?? {});

  // Only one plan can carry the `isDefault` flag. Marking a new one as default
  // implicitly clears the flag on the previous default so the admin never sees
  // two "default" plans at once.
  if (payload.isDefault) {
    await Plan.updateMany({ isDefault: true }, { $set: { isDefault: false } });
  }

  const plan = await repo.createPlan({
    name: payload.name,
    code: payload.code,
    description: payload.description ?? null,
    status: payload.status ?? 'draft',
    isDefault: Boolean(payload.isDefault),
    price: {
      amountMinor: payload.price?.amountMinor ?? 0,
      currency: payload.price?.currency ?? 'USD',
      intervalUnit: payload.price?.intervalUnit ?? 'months',
      intervalCount: payload.price?.intervalCount ?? 1,
    },
    features,
    quotas,
    subscriptionPlanId: payload.subscriptionPlanId ?? null,
    sortOrder: payload.sortOrder ?? 0,
    createdBy: actor?.id ?? null,
    updatedBy: actor?.id ?? null,
  });

  await audit(PLAN_AUDIT_ACTIONS.CREATED, {
    actor,
    entityType: ENTITY_PLAN,
    entityId: plan._id,
    metadata: { code: plan.code, name: plan.name, status: plan.status },
  });

  return toPublicPlan(plan);
};

export const updatePlan = async ({ id, payload, actor }) => {
  assertObjectId(id, 'plan id');
  const plan = await repo.findPlanById(id);
  if (!plan) throw new NotFoundError('Plan not found');

  const patch = { updatedBy: actor?.id ?? null };
  const changed = [];

  if (payload.code && payload.code !== plan.code) {
    const dup = await repo.findPlanByCode(payload.code);
    if (dup && dup._id.toString() !== plan._id.toString()) {
      throw new ConflictError('A plan with this code already exists', [
        { path: ['code'], message: 'Code is already in use' },
      ]);
    }
    patch.code = payload.code;
    changed.push('code');
  }
  if (payload.name !== undefined && payload.name !== plan.name) {
    patch.name = payload.name;
    changed.push('name');
  }
  if (payload.description !== undefined) {
    patch.description = payload.description;
    changed.push('description');
  }
  if (payload.price !== undefined) {
    patch.price = {
      amountMinor: payload.price?.amountMinor ?? plan.price?.amountMinor ?? 0,
      currency: payload.price?.currency ?? plan.price?.currency ?? 'USD',
      intervalUnit: payload.price?.intervalUnit ?? plan.price?.intervalUnit ?? 'months',
      intervalCount: payload.price?.intervalCount ?? plan.price?.intervalCount ?? 1,
    };
    changed.push('price');
  }
  if (payload.features !== undefined) {
    patch.features = sanitiseFeatures(payload.features);
    changed.push('features');
  }
  if (payload.quotas !== undefined) {
    patch.quotas = sanitiseQuotas(payload.quotas);
    changed.push('quotas');
  }
  if (payload.subscriptionPlanId !== undefined) {
    patch.subscriptionPlanId = payload.subscriptionPlanId ?? null;
    changed.push('subscriptionPlanId');
  }
  if (payload.sortOrder !== undefined) {
    patch.sortOrder = payload.sortOrder;
    changed.push('sortOrder');
  }
  if (payload.isDefault !== undefined && Boolean(payload.isDefault) !== Boolean(plan.isDefault)) {
    if (payload.isDefault) {
      await Plan.updateMany(
        { isDefault: true, _id: mongoose.trusted({ $ne: plan._id }) },
        { $set: { isDefault: false } },
      );
    }
    patch.isDefault = Boolean(payload.isDefault);
    changed.push('isDefault');
  }

  if (changed.length === 0) return toPublicPlan(plan);

  await repo.updatePlan(plan, patch);

  await audit(PLAN_AUDIT_ACTIONS.UPDATED, {
    actor,
    entityType: ENTITY_PLAN,
    entityId: plan._id,
    metadata: { changedKeys: changed },
  });

  return toPublicPlan(plan);
};

export const updatePlanStatus = async ({ id, status, actor }) => {
  assertObjectId(id, 'plan id');
  const plan = await repo.findPlanById(id);
  if (!plan) throw new NotFoundError('Plan not found');
  if (plan.status === status) return toPublicPlan(plan);

  const previous = plan.status;
  plan.status = status;
  plan.updatedBy = actor?.id ?? null;
  if (status === 'archived') {
    plan.archivedAt = new Date();
    if (plan.isDefault) plan.isDefault = false;
  }
  await plan.save();

  await audit(PLAN_AUDIT_ACTIONS.STATUS_CHANGED, {
    actor,
    entityType: ENTITY_PLAN,
    entityId: plan._id,
    metadata: { previousStatus: previous, nextStatus: status },
  });

  return toPublicPlan(plan);
};

// ---------------------------------------------------------------------------
// Plan assignment + history
// ---------------------------------------------------------------------------

/**
 * Returns the active assignment for a tenant, falling back to the database
 * default plan or the built-in `DEFAULT_PLAN` so every tenant always resolves
 * to *some* plan. Used by both the gating layer and the `/billing/plan`
 * endpoint, so it is intentionally side-effect free.
 */
export const getEffectivePlanForTenant = async ({ tenantId }) => {
  if (!tenantId) return { plan: { ...DEFAULT_PLAN }, assignment: null };
  assertObjectId(tenantId, 'tenant id');

  const assignment = await repo.findActiveAssignmentForTenant(tenantId);
  if (assignment) {
    if (assignment.planId) {
      const plan = await repo.findPlanById(assignment.planId);
      if (plan && plan.status !== 'archived') {
        return { plan: toPublicPlan(plan), assignment: toPublicAssignment(assignment) };
      }
    }
    // The plan was archived after assignment — keep the snapshot so historical
    // data still reflects what the tenant was paying for, but mark it
    // explicitly. Downgrades happen here.
    return {
      plan: {
        id: assignment.planId ? assignment.planId.toString() : null,
        code: assignment.planCodeSnapshot,
        name: assignment.planNameSnapshot,
        description: 'Plan archived; using the latest snapshot.',
        status: 'archived',
        isDefault: false,
        isFallback: false,
        price: { amountMinor: 0, currency: 'USD', intervalUnit: 'months', intervalCount: 1 },
        features: assignment.featuresSnapshot ?? {},
        quotas: assignment.quotasSnapshot ?? {},
        subscriptionPlanId: null,
        sortOrder: 0,
        createdAt: null,
        updatedAt: null,
      },
      assignment: toPublicAssignment(assignment),
    };
  }

  const dbDefault = await repo.findDefaultPlan();
  if (dbDefault) {
    return { plan: toPublicPlan(dbDefault), assignment: null };
  }
  return { plan: { ...DEFAULT_PLAN }, assignment: null };
};

/**
 * Assigns the plan to the tenant. Closes the previous assignment so the
 * history table always has exactly one open row per tenant. Snapshots the
 * plan's features and quotas so a later archive/edit cannot rewrite history.
 */
export const assignPlanToTenant = async ({
  tenantId,
  planId,
  actor,
  reason = null,
  subscriptionId = null,
  source = 'admin',
}) => {
  assertObjectId(tenantId, 'tenant id');
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new NotFoundError('Tenant not found');

  let plan = null;
  let features;
  let quotas;
  let planCodeSnapshot;
  let planNameSnapshot;

  if (planId) {
    assertObjectId(planId, 'plan id');
    plan = await repo.findPlanById(planId);
    if (!plan) throw new NotFoundError('Plan not found');
    if (plan.status === 'archived') {
      throw new ConflictError('Archived plans cannot be assigned to a tenant');
    }
    features = plan.normalizedFeatures();
    quotas = plan.normalizedQuotas();
    planCodeSnapshot = plan.code;
    planNameSnapshot = plan.name;
  } else {
    // Explicit "reset to default" assignment. We still record the row so the
    // history reflects the operation.
    features = { ...DEFAULT_PLAN.features };
    quotas = { ...DEFAULT_PLAN.quotas };
    planCodeSnapshot = DEFAULT_PLAN.code;
    planNameSnapshot = DEFAULT_PLAN.name;
  }

  const previous = await repo.findActiveAssignmentForTenant(tenantId);
  const samePlan =
    previous &&
    ((plan && previous.planId && previous.planId.toString() === plan._id.toString()) ||
      (!plan && !previous.planId));
  if (samePlan) {
    return {
      tenant: { id: tenant._id.toString(), planId: tenant.planId?.toString() ?? null },
      assignment: toPublicAssignment(previous),
      changed: false,
    };
  }

  const now = new Date();
  if (previous) await repo.closeAssignment(previous, now);

  const created = await repo.createAssignment({
    tenantId: tenant._id,
    planId: plan?._id ?? null,
    planCodeSnapshot,
    planNameSnapshot,
    featuresSnapshot: features,
    quotasSnapshot: quotas,
    assignedAt: now,
    assignedByUserId: actor?.id ?? null,
    reason,
    subscriptionId,
    source,
  });

  tenant.planId = plan?._id ?? null;
  await tenant.save();

  await audit(PLAN_AUDIT_ACTIONS.ASSIGNED, {
    actor,
    entityType: ENTITY_ASSIGNMENT,
    entityId: created._id,
    tenantId: tenant._id,
    metadata: {
      previousPlanCode: previous?.planCodeSnapshot ?? null,
      nextPlanCode: planCodeSnapshot,
      reason,
      source,
    },
  });

  return {
    tenant: {
      id: tenant._id.toString(),
      planId: tenant.planId?.toString() ?? null,
    },
    assignment: toPublicAssignment(created),
    changed: true,
  };
};

export const listAssignmentsForTenant = async ({ tenantId, query = {} }) => {
  assertObjectId(tenantId, 'tenant id');
  const result = await repo.findAssignmentsForTenant({
    tenantId,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
  });
  return {
    items: result.items.map(toPublicAssignment),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/**
 * Computes the live `used` value for a quota. Lifetime counters read directly
 * from the source collection so the value always matches reality. Monthly
 * counters read the upserted `quota_usage` row for the current period.
 */
export const computeQuotaUsage = async ({ tenantId, quotaKey }) => {
  const period = getQuotaPeriod(quotaKey);
  const periodKey = buildPeriodKey(period);

  if (period === QUOTA_PERIODS.MONTHLY) {
    const usage = await repo.findUsage({ tenantId, key: quotaKey, periodKey });
    return { used: usage?.usage ?? 0, period, periodKey };
  }

  // Lifetime counters — implemented inline so each model can supply its own
  // active-row predicate (e.g. surveys excludes archived, contacts excludes
  // blocked + archived). Doing this inside the plan module avoids creating a
  // sprawling registry; if more quotas need bespoke logic we can extract it
  // to a registry pattern later.
  switch (quotaKey) {
    case QUOTA_KEYS.USERS: {
      // Mirrors the seat math in team.service (active users + pending invites).
      const { User: UserModel } = await import('../users/user.model.js');
      const { TeamInvitation } = await import('../team/team-invitation.model.js');
      const [active, pending] = await Promise.all([
        UserModel.countDocuments({
          tenantId,
          status: mongoose.trusted({ $ne: 'inactive' }),
        }),
        TeamInvitation.countDocuments({ tenantId, status: 'pending' }),
      ]);
      return { used: active + pending, period, periodKey };
    }
    case QUOTA_KEYS.SURVEYS: {
      const { Survey } = await import('../surveys/survey.model.js');
      const used = await Survey.countDocuments({
        tenantId,
        status: mongoose.trusted({ $ne: 'archived' }),
      });
      return { used, period, periodKey };
    }
    case QUOTA_KEYS.CONTACTS: {
      const { Contact } = await import('../contacts/contact.model.js');
      const used = await Contact.countDocuments({ tenantId, status: 'active' });
      return { used, period, periodKey };
    }
    case QUOTA_KEYS.TEMPLATES: {
      const { Template } = await import('../templates/template.model.js');
      const used = await Template.countDocuments({
        tenantId,
        isSystemTemplate: mongoose.trusted({ $ne: true }),
      });
      return { used, period, periodKey };
    }
    case QUOTA_KEYS.STORAGE_MB: {
      const { MediaAsset } = await import('../media/media-asset.model.js').catch(() => ({
        MediaAsset: null,
      }));
      if (!MediaAsset) return { used: 0, period, periodKey };
      const aggregate = await MediaAsset.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
        { $group: { _id: null, totalBytes: { $sum: { $ifNull: ['$sizeBytes', 0] } } } },
      ]);
      const bytes = aggregate?.[0]?.totalBytes ?? 0;
      return { used: Math.round(bytes / (1024 * 1024)), period, periodKey };
    }
    default:
      return { used: 0, period, periodKey };
  }
};

/**
 * Returns the full usage table for a tenant, joined with the active plan's
 * limits. Used by both `/billing/usage` (tenant view) and the admin tenant
 * detail panel.
 */
export const getUsageReport = async ({ tenantId }) => {
  assertObjectId(tenantId, 'tenant id');
  const { plan, assignment } = await getEffectivePlanForTenant({ tenantId });

  const rows = await Promise.all(
    QUOTA_DEFINITIONS.map(async (def) => {
      const { used } = await computeQuotaUsage({ tenantId, quotaKey: def.key });
      const limit = plan.quotas?.[def.key];
      const limitValue = limit === null || limit === undefined ? null : limit;
      const remaining = limitValue === null ? null : Math.max(0, limitValue - used);
      const percentUsed =
        limitValue === null || limitValue === 0
          ? null
          : Math.min(100, Math.round((used / limitValue) * 100));
      return {
        key: def.key,
        label: def.label,
        period: def.period,
        used,
        limit: limitValue,
        unlimited: limitValue === null,
        remaining,
        percentUsed,
        warning: limitValue !== null && limitValue > 0 && used / limitValue >= 0.8,
        exhausted: limitValue !== null && used >= limitValue,
      };
    }),
  );

  return { plan, assignment, quotas: rows };
};

// ---------------------------------------------------------------------------
// Feature + quota enforcement helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the tenant's effective plan grants the feature. Tenants
 * without an explicit plan inherit `DEFAULT_PLAN`.
 */
export const tenantHasFeature = async ({ tenantId, feature }) => {
  const { plan } = await getEffectivePlanForTenant({ tenantId });
  return Boolean(plan?.features?.[feature]);
};

/**
 * Throws `FeatureBlockedError` when the tenant's plan does not include the
 * feature. Used by feature gates and routes that should hard-block.
 */
export const assertFeature = async ({ tenantId, feature }) => {
  const { plan } = await getEffectivePlanForTenant({ tenantId });
  if (!plan?.features?.[feature]) {
    const { FeatureBlockedError } = await import(
      '../../common/errors/feature-blocked-error.js'
    );
    throw new FeatureBlockedError(`Your plan does not include this feature: ${feature}`, {
      feature,
      planCode: plan?.code ?? null,
      planName: plan?.name ?? null,
    });
  }
};

/**
 * Throws `QuotaExceededError` when the requested action would push the
 * tenant past the quota. `requested` defaults to 1 — callers pass higher
 * values when batching (e.g. bulk contact import).
 */
export const assertQuota = async ({ tenantId, quotaKey, requested = 1 }) => {
  const { plan } = await getEffectivePlanForTenant({ tenantId });
  const limit = plan?.quotas?.[quotaKey];
  if (limit === null || limit === undefined) return; // unlimited
  const { used } = await computeQuotaUsage({ tenantId, quotaKey });
  if (used + requested > limit) {
    const { QuotaExceededError } = await import(
      '../../common/errors/quota-exceeded-error.js'
    );
    throw new QuotaExceededError(`Quota '${quotaKey}' exceeded for the active plan`, {
      quota: quotaKey,
      limit,
      usage: used,
      requested,
      planCode: plan?.code ?? null,
      planName: plan?.name ?? null,
    });
  }
};

/**
 * Atomically increments the monthly counter for a tenant. Returns the new
 * usage value. Use after a successful action (e.g. campaign launched,
 * response submitted) — this method does *not* check the quota itself, the
 * caller is expected to call `assertQuota` first when it wants to block.
 */
export const consumeMonthlyQuota = async ({ tenantId, quotaKey, amount = 1 }) => {
  if (!tenantId || !quotaKey || amount <= 0) return null;
  const period = getQuotaPeriod(quotaKey);
  if (period !== QUOTA_PERIODS.MONTHLY) return null;
  const periodKey = buildPeriodKey(period);
  const row = await repo.incrementUsage({
    tenantId,
    key: quotaKey,
    period,
    periodKey,
    amount,
  });
  return { usage: row.usage, periodKey };
};

// ---------------------------------------------------------------------------
// Catalogue (consumed by frontend and admin payload validation)
// ---------------------------------------------------------------------------

export { FEATURE_DEFINITIONS, QUOTA_DEFINITIONS } from './plan.constants.js';

export const __testing = {
  sanitiseFeatures,
  sanitiseQuotas,
  toPublicAssignment,
};
