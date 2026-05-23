import * as planService from './plan.service.js';
import { FEATURE_DEFINITIONS, QUOTA_DEFINITIONS } from './plan.constants.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { AuthorizationError } from '../../common/errors/index.js';

const requireTenant = (req) => {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required');
  }
  return tenantId;
};

/**
 * Returns the active plan for the calling tenant. We expose the plan-shape
 * fields the client needs to drive feature gates and usage meters; the price
 * is included so the upgrade prompt can show "$X / month".
 */
export const getMyPlan = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const data = await planService.getEffectivePlanForTenant({ tenantId });
  return sendSuccess(res, { data, message: 'Plan fetched' });
});

export const getMyUsage = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const report = await planService.getUsageReport({ tenantId });
  return sendSuccess(res, { data: report, message: 'Usage fetched' });
});

export const listAvailablePlans = asyncHandler(async (req, res) => {
  // We require tenant context so the listing is only reachable by authenticated
  // tenant users; super admins use the admin endpoint instead.
  requireTenant(req);
  const items = await planService.listActivePlans();
  return sendSuccess(res, { data: { items }, message: 'Available plans fetched' });
});

export const getCatalogue = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    data: { features: FEATURE_DEFINITIONS, quotas: QUOTA_DEFINITIONS },
    message: 'Plan catalogue fetched',
  }),
);
