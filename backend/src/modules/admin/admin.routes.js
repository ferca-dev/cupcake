import { Router } from 'express';

import { authenticate } from '../../common/middlewares/authenticate.js';
import { requireRole } from '../../common/middlewares/authorize.js';
import { ROLES } from '../../common/auth/roles.js';
import * as adminTenantController from '../tenants/admin-tenant.controller.js';
import * as dashboardController from '../dashboard/dashboard.controller.js';

/**
 * Single Express router that owns every `/api/v1/admin/*` endpoint. We mount
 * the auth + role guard once so every route below is super-admin only —
 * client roles never reach the handlers and cannot escalate by URL guessing.
 */
export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRole(ROLES.SUPER_ADMIN));

// Platform-wide metrics. Re-uses the dashboard controller so we keep one
// source of truth for the metric shape.
adminRouter.get('/metrics', dashboardController.getAdminMetrics);

// Tenant management
adminRouter.get('/tenants', adminTenantController.listTenants);
adminRouter.post('/tenants', adminTenantController.createTenant);
adminRouter.get('/tenants/:id', adminTenantController.getTenant);
adminRouter.put('/tenants/:id', adminTenantController.updateTenant);
adminRouter.patch('/tenants/:id/status', adminTenantController.updateTenantStatus);
adminRouter.get('/tenants/:id/users', adminTenantController.listTenantUsers);
