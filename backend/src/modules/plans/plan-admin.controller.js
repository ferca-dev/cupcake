import * as planService from './plan.service.js';
import {
  createPlanSchema,
  updatePlanSchema,
  updatePlanStatusSchema,
  listPlansQuerySchema,
  assignPlanSchema,
} from './plan.validation.js';
import { FEATURE_DEFINITIONS, QUOTA_DEFINITIONS } from './plan.constants.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

export const listPlans = asyncHandler(async (req, res) => {
  const query = listPlansQuerySchema.parse(req.query ?? {});
  const result = await planService.listPlans(query);
  return sendSuccess(res, { data: result, message: 'Plans fetched' });
});

export const getPlan = asyncHandler(async (req, res) => {
  const plan = await planService.getPlan({ id: req.params.id });
  return sendSuccess(res, { data: { plan }, message: 'Plan fetched' });
});

export const createPlan = asyncHandler(async (req, res) => {
  const payload = createPlanSchema.parse(req.body ?? {});
  const plan = await planService.createPlan({ payload, actor: req.user });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { plan },
    message: 'Plan created',
  });
});

export const updatePlan = asyncHandler(async (req, res) => {
  const payload = updatePlanSchema.parse(req.body ?? {});
  const plan = await planService.updatePlan({ id: req.params.id, payload, actor: req.user });
  return sendSuccess(res, { data: { plan }, message: 'Plan updated' });
});

export const updatePlanStatus = asyncHandler(async (req, res) => {
  const { status } = updatePlanStatusSchema.parse(req.body ?? {});
  const plan = await planService.updatePlanStatus({
    id: req.params.id,
    status,
    actor: req.user,
  });
  return sendSuccess(res, { data: { plan }, message: 'Plan status updated' });
});

export const assignTenantPlan = asyncHandler(async (req, res) => {
  const payload = assignPlanSchema.parse(req.body ?? {});
  const result = await planService.assignPlanToTenant({
    tenantId: req.params.tenantId,
    planId: payload.planId ?? null,
    reason: payload.reason ?? null,
    subscriptionId: payload.subscriptionId ?? null,
    source: payload.source ?? 'admin',
    actor: req.user,
  });
  return sendSuccess(res, { data: result, message: 'Plan assigned to tenant' });
});

export const listTenantPlanHistory = asyncHandler(async (req, res) => {
  const result = await planService.listAssignmentsForTenant({
    tenantId: req.params.tenantId,
    query: req.query ?? {},
  });
  return sendSuccess(res, { data: result, message: 'Tenant plan history fetched' });
});

export const getTenantPlan = asyncHandler(async (req, res) => {
  const data = await planService.getEffectivePlanForTenant({ tenantId: req.params.tenantId });
  return sendSuccess(res, { data, message: 'Tenant plan fetched' });
});

export const getTenantUsage = asyncHandler(async (req, res) => {
  const report = await planService.getUsageReport({ tenantId: req.params.tenantId });
  return sendSuccess(res, { data: report, message: 'Tenant usage fetched' });
});

export const getCatalogue = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    data: { features: FEATURE_DEFINITIONS, quotas: QUOTA_DEFINITIONS },
    message: 'Plan catalogue fetched',
  }),
);
