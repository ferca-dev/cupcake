import { Router } from 'express';

import * as controller from './payment.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

/**
 * Client-facing payment routes. Mounted under `/api/v1/billing` alongside the
 * token wallet endpoints. Every route requires `billing.view`; subscription
 * mutations also rely on tenant scoping.
 */
export const paymentBillingRouter = Router();

paymentBillingRouter.use(authenticate);
paymentBillingRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

paymentBillingRouter.post(
  '/mercadopago/preferences',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.createTokenPackagePreference,
);

paymentBillingRouter.get(
  '/payments',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.listClientPayments,
);

paymentBillingRouter.get(
  '/payments/:id',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.getClientPayment,
);

paymentBillingRouter.get(
  '/subscription-plans',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.listClientSubscriptionPlans,
);

paymentBillingRouter.get(
  '/subscriptions',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.listClientSubscriptions,
);

paymentBillingRouter.post(
  '/subscriptions',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.createSubscription,
);

paymentBillingRouter.post(
  '/subscriptions/:id/cancel',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.cancelClientSubscription,
);

paymentBillingRouter.post(
  '/subscriptions/:id/resume',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.resumeClientSubscription,
);

paymentBillingRouter.get(
  '/subscription-invoices',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  controller.listClientInvoices,
);
