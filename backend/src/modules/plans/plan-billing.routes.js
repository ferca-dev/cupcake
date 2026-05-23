import { Router } from 'express';

import * as billingController from './plan-billing.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requireTenantContext } from '../../common/middlewares/authorize.js';

/**
 * Tenant-facing plan endpoints. Mounted under `/billing` so they sit next to
 * the existing token wallet and Mercado Pago surface. Authorization is the
 * standard tenant guard — no special permission is required to view your own
 * plan and usage.
 */
export const planBillingRouter = Router();

planBillingRouter.use(authenticate);
planBillingRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

planBillingRouter.get('/plan', billingController.getMyPlan);
planBillingRouter.get('/usage', billingController.getMyUsage);
planBillingRouter.get('/plans/available', billingController.listAvailablePlans);
planBillingRouter.get('/plans/catalogue', billingController.getCatalogue);
