import { Router } from 'express';

import * as templateController from './template.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import {
  requirePermission,
  requireAnyPermission,
  requireTenantContext,
} from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const templatesRouter = Router();

templatesRouter.use(authenticate);
// Super admins can manage system templates (`tenantId: null`) without
// impersonating a tenant, so `allowSuperAdminGlobal: true` is required.
templatesRouter.use(requireTenantContext({ allowSuperAdminGlobal: true }));

// Listing and `create-survey` are gated by `surveys.view` / `surveys.create`
// so that template browsing follows the same surface area as the builder.
// Direct template editing is gated by `templates.manage`.
templatesRouter.get(
  '/',
  requireAnyPermission(PERMISSIONS.SURVEYS_VIEW, PERMISSIONS.TEMPLATES_MANAGE),
  templateController.listTemplates,
);

templatesRouter.post(
  '/',
  requirePermission(PERMISSIONS.TEMPLATES_MANAGE),
  templateController.createTemplate,
);

templatesRouter.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.SURVEYS_VIEW, PERMISSIONS.TEMPLATES_MANAGE),
  templateController.getTemplate,
);

templatesRouter.put(
  '/:id',
  requirePermission(PERMISSIONS.TEMPLATES_MANAGE),
  templateController.updateTemplate,
);

templatesRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.TEMPLATES_MANAGE),
  templateController.deleteTemplate,
);

templatesRouter.post(
  '/:id/create-survey',
  requirePermission(PERMISSIONS.SURVEYS_CREATE),
  templateController.createSurveyFromTemplate,
);
