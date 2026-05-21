import * as campaignService from './campaign.service.js';
import {
  createCampaignSchema,
  listCampaignsQuerySchema,
  listRecipientsQuerySchema,
} from './campaign.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

export const listCampaigns = asyncHandler(async (req, res) => {
  const query = listCampaignsQuerySchema.parse(req.query ?? {});
  const tenantId = resolveTenantId(req);
  const result = await campaignService.listCampaigns({ tenantId, ...query });
  return sendSuccess(res, { data: result, message: 'Campaigns fetched' });
});

export const getCampaign = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const campaign = await campaignService.getCampaign({ id: req.params.id, tenantId });
  return sendSuccess(res, { data: { campaign }, message: 'Campaign fetched' });
});

export const createCampaign = asyncHandler(async (req, res) => {
  const payload = createCampaignSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const campaign = await campaignService.createCampaign({
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { campaign },
    message: 'Campaign created',
  });
});

export const sendCampaign = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const result = await campaignService.sendCampaign({
    id: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Campaign dispatched' });
});

export const listRecipients = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const query = listRecipientsQuerySchema.parse(req.query ?? {});
  const result = await campaignService.listRecipients({
    id: req.params.id,
    tenantId,
    query,
  });
  return sendSuccess(res, { data: result, message: 'Recipients fetched' });
});

export const getCampaignReport = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const report = await campaignService.getReport({ id: req.params.id, tenantId });
  return sendSuccess(res, { data: { report }, message: 'Campaign report fetched' });
});
