import mongoose from 'mongoose';

import { Plan } from './plan.model.js';
import { PlanAssignment } from './plan-assignment.model.js';
import { QuotaUsage } from './quota-usage.model.js';
import { PLAN_STATUSES } from './plan.constants.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds the Mongo filter for the admin plan list. Restricts by status when
 * supplied and supports a simple case-insensitive search across `name` and
 * `code` so the admin UI can type-ahead through the catalogue.
 */
const buildPlanFilter = ({ status, search } = {}) => {
  const filter = {};
  if (status) {
    if (!PLAN_STATUSES.includes(status)) {
      throw new Error(`Invalid plan status filter: ${status}`);
    }
    filter.status = status;
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = mongoose.trusted([{ name: re }, { code: re }]);
  }
  return filter;
};

const sortToMongo = (sort = 'sortOrder') => {
  const direction = sort.startsWith('-') ? -1 : 1;
  const key = sort.replace(/^-/, '');
  return { [key]: direction, _id: 1 };
};

export const createPlan = (payload) => Plan.create(payload);

export const findPlanById = (id) => Plan.findById(id);

export const findPlanByCode = (code) => Plan.findOne({ code: code.toLowerCase() });

export const findPlans = async ({
  status,
  search,
  page = 1,
  limit = 25,
  sort = 'sortOrder',
} = {}) => {
  const filter = buildPlanFilter({ status, search });
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Plan.find(filter).sort(sortToMongo(sort)).skip(skip).limit(limit),
    Plan.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findActivePlans = () =>
  Plan.find({ status: 'active' }).sort({ sortOrder: 1, name: 1 });

export const findDefaultPlan = () => Plan.findOne({ isDefault: true, status: 'active' });

export const updatePlan = async (plan, patch) => {
  Object.assign(plan, patch);
  await plan.save();
  return plan;
};

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const createAssignment = (payload) => PlanAssignment.create(payload);

export const findActiveAssignmentForTenant = (tenantId) =>
  PlanAssignment.findOne({ tenantId, replacedAt: null }).sort({ assignedAt: -1 });

export const closeAssignment = (assignment, replacedAt) => {
  assignment.replacedAt = replacedAt;
  return assignment.save();
};

export const findAssignmentsForTenant = async ({ tenantId, page = 1, limit = 25 } = {}) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PlanAssignment.find({ tenantId }).sort({ assignedAt: -1 }).skip(skip).limit(limit),
    PlanAssignment.countDocuments({ tenantId }),
  ]);
  return { items, total, page, limit };
};

// ---------------------------------------------------------------------------
// Quota usage
// ---------------------------------------------------------------------------

/**
 * Atomic `$inc` of the monthly usage counter for a tenant. Uses an upsert so
 * the first call in a month creates the row in the same write that increments
 * it — no read-modify-write race window.
 */
export const incrementUsage = ({ tenantId, key, period, periodKey, amount }) =>
  QuotaUsage.findOneAndUpdate(
    { tenantId, key, periodKey },
    {
      $inc: { usage: amount },
      $setOnInsert: { period },
      $set: { lastIncrementedAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

export const findUsage = ({ tenantId, key, periodKey }) =>
  QuotaUsage.findOne({ tenantId, key, periodKey });

export const findAllUsageForTenant = ({ tenantId, periodKey }) =>
  QuotaUsage.find({ tenantId, periodKey });

export const resetUsage = ({ tenantId, key, periodKey }) =>
  QuotaUsage.updateOne(
    { tenantId, key, periodKey },
    { $set: { usage: 0, lastIncrementedAt: new Date() } },
  );
