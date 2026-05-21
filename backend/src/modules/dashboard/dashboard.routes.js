import { Router } from 'express';

import * as dashboardController from './dashboard.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import {
  requirePermission,
  requireTenantContext,
} from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);
// Tenant-bound users get their own tenant; super admins can opt into a tenant
// via the `x-impersonate-tenant` header, otherwise they fall through to the
// global view inside the controller.
dashboardRouter.use(requireTenantContext({ allowSuperAdminGlobal: true }));

dashboardRouter.get(
  '/summary',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  dashboardController.getSummary,
);

dashboardRouter.get(
  '/channels',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  dashboardController.getChannels,
);

dashboardRouter.get(
  '/recent-activity',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  dashboardController.getRecentActivity,
);

dashboardRouter.get(
  '/surveys/:id',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  dashboardController.getSurveyStats,
);
