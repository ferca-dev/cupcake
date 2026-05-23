import { Router } from 'express';

import { authenticate } from '../../common/middlewares/authenticate.js';
import { requireRole } from '../../common/middlewares/authorize.js';
import { ROLES } from '../../common/auth/roles.js';
import * as adminTenantController from '../tenants/admin-tenant.controller.js';
import * as dashboardController from '../dashboard/dashboard.controller.js';
import * as tokenAdminController from '../tokens/token-admin.controller.js';

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

// Token packages
adminRouter.get('/token-packages', tokenAdminController.listPackages);
adminRouter.post('/token-packages', tokenAdminController.createPackage);
adminRouter.put('/token-packages/:id', tokenAdminController.updatePackage);
adminRouter.patch('/token-packages/:id/status', tokenAdminController.updatePackageStatus);

// Channel pricing rules
adminRouter.get('/channel-pricing', tokenAdminController.listChannelPricing);
adminRouter.put('/channel-pricing', tokenAdminController.updateChannelPricing);

// Tenant wallet, send limits, and manual adjustments
adminRouter.get('/tenants/:tenantId/token-wallet', tokenAdminController.getTenantWallet);
adminRouter.get('/tenants/:tenantId/send-limits', tokenAdminController.getTenantSendLimits);
adminRouter.put('/tenants/:tenantId/send-limits', tokenAdminController.updateTenantSendLimits);
adminRouter.post('/tenants/:tenantId/token-adjustments', tokenAdminController.adjustTenantWallet);

// Token purchases (cross-tenant queue + approval flow)
adminRouter.get('/token-purchases', tokenAdminController.listPurchases);
adminRouter.post('/token-purchases/:id/approve', tokenAdminController.approvePurchase);
adminRouter.post('/token-purchases/:id/reject', tokenAdminController.rejectPurchase);
