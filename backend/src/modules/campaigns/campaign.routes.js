import { Router } from 'express';

import * as campaignController from './campaign.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const campaignsRouter = Router();

campaignsRouter.use(authenticate);
campaignsRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

campaignsRouter.get(
  '/',
  requirePermission(PERMISSIONS.CAMPAIGNS_SEND),
  campaignController.listCampaigns,
);

campaignsRouter.post(
  '/',
  requirePermission(PERMISSIONS.CAMPAIGNS_SEND),
  campaignController.createCampaign,
);

campaignsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.CAMPAIGNS_SEND),
  campaignController.getCampaign,
);

campaignsRouter.post(
  '/:id/send',
  requirePermission(PERMISSIONS.CAMPAIGNS_SEND),
  campaignController.sendCampaign,
);

campaignsRouter.get(
  '/:id/recipients',
  requirePermission(PERMISSIONS.CAMPAIGNS_SEND),
  campaignController.listRecipients,
);

campaignsRouter.get(
  '/:id/report',
  requirePermission(PERMISSIONS.CAMPAIGNS_SEND),
  campaignController.getCampaignReport,
);
