import { Router } from 'express';

import * as billingController from './token-billing.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

/**
 * Client-facing token routes mounted under `/api/v1/billing`. Super admins
 * may impersonate a tenant via the `x-impersonate-tenant` header to inspect
 * the same data without escalating to the admin endpoints.
 */
export const tokenBillingRouter = Router();

tokenBillingRouter.use(authenticate);
tokenBillingRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

tokenBillingRouter.get(
  '/tokens/balance',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  billingController.getBalance,
);

tokenBillingRouter.get(
  '/tokens/ledger',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  billingController.listLedger,
);

tokenBillingRouter.get(
  '/token-packages',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  billingController.listAvailablePackages,
);

tokenBillingRouter.get(
  '/token-purchases',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  billingController.listMyPurchases,
);

tokenBillingRouter.post(
  '/token-purchases',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  billingController.createPurchaseRequest,
);
