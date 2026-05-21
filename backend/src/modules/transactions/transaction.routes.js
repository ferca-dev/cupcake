import { Router } from 'express';

import * as transactionController from './transaction.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const transactionsRouter = Router();

transactionsRouter.use(authenticate);
// Super admins are allowed without an impersonated tenant — they get a global
// view (audited inside the service). Client users must always carry their
// tenant context.
transactionsRouter.use(requireTenantContext({ allowSuperAdminGlobal: true }));

transactionsRouter.get(
  '/',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  transactionController.listTransactions,
);

transactionsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.BILLING_VIEW),
  transactionController.getTransaction,
);
