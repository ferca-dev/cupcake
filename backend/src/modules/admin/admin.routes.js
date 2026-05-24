import { Router } from 'express';

import { authenticate } from '../../common/middlewares/authenticate.js';
import { requireRole } from '../../common/middlewares/authorize.js';
import { ROLES } from '../../common/auth/roles.js';
import * as adminTenantController from '../tenants/admin-tenant.controller.js';
import * as dashboardController from '../dashboard/dashboard.controller.js';
import * as tokenAdminController from '../tokens/token-admin.controller.js';
import * as paymentAdminController from '../payments/admin-payment.controller.js';
import * as planAdminController from '../plans/plan-admin.controller.js';
import * as jobAdminController from '../jobs/job-admin.controller.js';

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
adminRouter.get('/tenants/:id/invitations', adminTenantController.listTenantInvitations);

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

// Mercado Pago payments, webhook events, and reconciliation
adminRouter.get('/payments', paymentAdminController.listPayments);
adminRouter.get('/payments/:id', paymentAdminController.getPayment);
adminRouter.get('/payment-webhooks', paymentAdminController.listWebhookEvents);
adminRouter.post('/payments/reconcile', paymentAdminController.reconcilePayment);

// Subscription plans
adminRouter.get('/subscription-plans', paymentAdminController.listPlans);
adminRouter.post('/subscription-plans', paymentAdminController.createPlan);
adminRouter.put('/subscription-plans/:id', paymentAdminController.updatePlan);
adminRouter.patch('/subscription-plans/:id/status', paymentAdminController.updatePlanStatus);

// Tenant subscriptions
adminRouter.get('/subscriptions', paymentAdminController.listSubscriptions);
adminRouter.post('/subscriptions/:id/sync', paymentAdminController.syncSubscription);
adminRouter.post('/subscriptions/:id/cancel', paymentAdminController.cancelSubscriptionAsAdmin);
adminRouter.post('/subscriptions/:id/pause', paymentAdminController.pauseSubscriptionAsAdmin);

// Reminder triggers (callable from a scheduled job or operator console)
adminRouter.post(
  '/payments/reminders/low-balance',
  paymentAdminController.triggerLowBalanceReminders,
);
adminRouter.post('/payments/reminders/renewals', paymentAdminController.triggerRenewalReminders);

// Background jobs (queue visibility + retry).
adminRouter.get('/jobs', jobAdminController.listJobs);
adminRouter.get('/jobs/stats', jobAdminController.getJobStats);
adminRouter.get('/jobs/:id', jobAdminController.getJob);
adminRouter.post('/jobs/:id/retry', jobAdminController.retryJob);

// Plans, feature gates, and tenant assignment
adminRouter.get('/plans', planAdminController.listPlans);
adminRouter.post('/plans', planAdminController.createPlan);
adminRouter.get('/plans/catalogue', planAdminController.getCatalogue);
adminRouter.get('/plans/:id', planAdminController.getPlan);
adminRouter.put('/plans/:id', planAdminController.updatePlan);
adminRouter.patch('/plans/:id/status', planAdminController.updatePlanStatus);
adminRouter.post('/tenants/:tenantId/plan', planAdminController.assignTenantPlan);
adminRouter.get('/tenants/:tenantId/plan', planAdminController.getTenantPlan);
adminRouter.get('/tenants/:tenantId/plan-history', planAdminController.listTenantPlanHistory);
adminRouter.get('/tenants/:tenantId/usage', planAdminController.getTenantUsage);
