import { Router } from 'express';

import * as suppressionController from './suppression.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const suppressionRouter = Router();

suppressionRouter.use(authenticate);
suppressionRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

suppressionRouter.get(
  '/',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  suppressionController.listSuppressionEntries,
);

suppressionRouter.post(
  '/',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  suppressionController.createSuppressionEntry,
);

suppressionRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  suppressionController.releaseSuppressionEntry,
);

export const publicSuppressionRouter = Router();

publicSuppressionRouter.get(
  '/unsubscribe/email/:token',
  suppressionController.previewEmailUnsubscribe,
);

publicSuppressionRouter.post('/unsubscribe/email', suppressionController.processEmailUnsubscribe);
