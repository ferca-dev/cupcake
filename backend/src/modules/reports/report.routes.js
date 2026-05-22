import { Router } from 'express';

import * as reportController from './report.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

/**
 * Report routes are mounted by the surveys router as
 * `/api/v1/surveys/:id/reports/*`. We rely on `mergeParams` so the controller
 * can resolve the surveyId from the parent path.
 *
 * Reading reports requires `responses.view` since the data exposed is the
 * aggregate of survey responses. The tenant context middleware is enforced
 * here (it's also enforced on the parent surveys router) so impersonation
 * stays explicit for super admins.
 */
export const reportsRouter = Router({ mergeParams: true });

reportsRouter.use(authenticate);
reportsRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

reportsRouter.get(
  '/overview',
  requirePermission(PERMISSIONS.RESPONSES_VIEW),
  reportController.getOverview,
);
reportsRouter.get(
  '/channels',
  requirePermission(PERMISSIONS.RESPONSES_VIEW),
  reportController.getChannels,
);
reportsRouter.get(
  '/questions',
  requirePermission(PERMISSIONS.RESPONSES_VIEW),
  reportController.getQuestions,
);
reportsRouter.get(
  '/trends',
  requirePermission(PERMISSIONS.RESPONSES_VIEW),
  reportController.getTrends,
);
reportsRouter.get(
  '/drop-off',
  requirePermission(PERMISSIONS.RESPONSES_VIEW),
  reportController.getDropOff,
);
reportsRouter.get(
  '/timing',
  requirePermission(PERMISSIONS.RESPONSES_VIEW),
  reportController.getTiming,
);
reportsRouter.get(
  '/versions',
  requirePermission(PERMISSIONS.RESPONSES_VIEW),
  reportController.getVersions,
);
reportsRouter.get(
  '/export',
  requirePermission(PERMISSIONS.RESPONSES_VIEW),
  reportController.exportReport,
);
