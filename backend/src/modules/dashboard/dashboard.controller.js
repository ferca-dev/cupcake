import * as dashboardService from './dashboard.service.js';
import {
  recentActivityQuerySchema,
  adminMetricsQuerySchema,
} from './dashboard.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { AuthorizationError } from '../../common/errors/index.js';

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

const requireTenantOrAdmin = (req) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId && !req.user?.isSuperAdmin) {
    throw new AuthorizationError('Tenant context is required for dashboard metrics');
  }
  return tenantId;
};

export const getSummary = asyncHandler(async (req, res) => {
  const tenantId = requireTenantOrAdmin(req);
  if (!tenantId) {
    // Super admin without an impersonated tenant → return the global admin
    // view so the same endpoint can power both dashboards.
    const metrics = await dashboardService.getAdminMetrics({ limit: 10 });
    return sendSuccess(res, {
      data: { scope: 'global', summary: metrics },
      message: 'Global dashboard summary fetched',
    });
  }
  const summary = await dashboardService.getClientDashboardSummary({ tenantId });
  return sendSuccess(res, {
    data: { scope: 'tenant', summary },
    message: 'Dashboard summary fetched',
  });
});

export const getSurveyStats = asyncHandler(async (req, res) => {
  const tenantId = requireTenantOrAdmin(req);
  if (!tenantId) {
    throw new AuthorizationError(
      'Super admin must select a tenant to inspect survey stats',
    );
  }
  const stats = await dashboardService.getSurveyDashboardStats({
    tenantId,
    surveyId: req.params.id,
  });
  return sendSuccess(res, { data: { stats }, message: 'Survey stats fetched' });
});

export const getChannels = asyncHandler(async (req, res) => {
  const tenantId = requireTenantOrAdmin(req);
  if (!tenantId) {
    throw new AuthorizationError(
      'Super admin must select a tenant to inspect channel metrics',
    );
  }
  const metrics = await dashboardService.getChannelMetrics({ tenantId });
  return sendSuccess(res, { data: metrics, message: 'Channel metrics fetched' });
});

export const getRecentActivity = asyncHandler(async (req, res) => {
  const tenantId = requireTenantOrAdmin(req);
  const query = recentActivityQuerySchema.parse(req.query ?? {});
  const activity = await dashboardService.getRecentActivity({
    tenantId,
    limit: query.limit,
    // Super admins without a specific tenant see global activity; with a
    // selected tenant they see that tenant's activity plus platform-wide
    // events (tenantId: null), which is more useful than tenant-only data.
    includeGlobal: req.user?.isSuperAdmin && Boolean(tenantId),
  });
  return sendSuccess(res, {
    data: { items: activity },
    message: 'Recent activity fetched',
  });
});

export const getAdminMetrics = asyncHandler(async (req, res) => {
  const query = adminMetricsQuerySchema.parse(req.query ?? {});
  const metrics = await dashboardService.getAdminMetrics({ limit: query.limit });
  return sendSuccess(res, { data: { metrics }, message: 'Admin metrics fetched' });
});
