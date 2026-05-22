import { Router } from 'express';

import * as surveyController from './survey.controller.js';
import { reportsRouter } from '../reports/report.routes.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import {
  requirePermission,
  requireAnyPermission,
  requireTenantContext,
} from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const surveysRouter = Router();

surveysRouter.use(authenticate);
surveysRouter.use(requireTenantContext());

// Per-survey statistical reports live under `/api/v1/surveys/:id/reports`.
// The reports router re-applies `authenticate` and `requireTenantContext`
// internally so it can be reused if mounted at the API root in the future.
surveysRouter.use('/:id/reports', reportsRouter);

surveysRouter.get('/', requirePermission(PERMISSIONS.SURVEYS_VIEW), surveyController.listSurveys);

surveysRouter.post(
  '/',
  requirePermission(PERMISSIONS.SURVEYS_CREATE),
  surveyController.createSurvey,
);

surveysRouter.get('/:id', requirePermission(PERMISSIONS.SURVEYS_VIEW), surveyController.getSurvey);

surveysRouter.put(
  '/:id',
  requirePermission(PERMISSIONS.SURVEYS_UPDATE),
  surveyController.updateSurvey,
);

surveysRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.SURVEYS_DELETE),
  surveyController.deleteSurvey,
);

surveysRouter.post(
  '/:id/duplicate',
  requirePermission(PERMISSIONS.SURVEYS_CREATE),
  surveyController.duplicateSurvey,
);

surveysRouter.post(
  '/:id/publish',
  requirePermission(PERMISSIONS.SURVEYS_PUBLISH),
  surveyController.publishSurvey,
);

surveysRouter.post(
  '/:id/pause',
  requirePermission(PERMISSIONS.SURVEYS_PUBLISH),
  surveyController.pauseSurvey,
);

surveysRouter.post(
  '/:id/archive',
  requireAnyPermission(PERMISSIONS.SURVEYS_DELETE, PERMISSIONS.SURVEYS_PUBLISH),
  surveyController.archiveSurvey,
);

surveysRouter.get(
  '/:id/versions',
  requirePermission(PERMISSIONS.SURVEYS_VIEW),
  surveyController.listVersions,
);

surveysRouter.get(
  '/:id/stats',
  requirePermission(PERMISSIONS.SURVEYS_VIEW),
  surveyController.getStats,
);
