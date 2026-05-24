import { Router } from 'express';

import * as controller from './surveyor.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const surveyorRouter = Router();

surveyorRouter.use(authenticate);
surveyorRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));
surveyorRouter.use(requirePermission(PERMISSIONS.SURVEYOR_RESPONSES_SUBMIT));

surveyorRouter.get('/surveys', controller.listSurveys);
surveyorRouter.get('/surveys/:id', controller.getSurvey);
surveyorRouter.post('/surveys/:id/responses', controller.submitResponse);
