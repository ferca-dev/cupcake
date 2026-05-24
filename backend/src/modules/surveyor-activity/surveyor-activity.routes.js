import { Router } from 'express';

import * as controller from './surveyor-activity.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const surveyorActivityRouter = Router();

surveyorActivityRouter.use(authenticate);
surveyorActivityRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));
surveyorActivityRouter.use(requirePermission(PERMISSIONS.SURVEYOR_ACTIVITY_VIEW));

surveyorActivityRouter.get('/summary', controller.getSummary);
surveyorActivityRouter.get('/responses', controller.listResponses);
surveyorActivityRouter.get('/map', controller.getMap);
surveyorActivityRouter.get('/export', controller.exportActivity);
surveyorActivityRouter.get('/surveyors/:userId', controller.getSurveyor);
