import * as campaignService from './campaign.service.js';
import {
  createCampaignSchema,
  listCampaignsQuerySchema,
  listRecipientsQuerySchema,
} from './campaign.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';
import { enqueueCampaignSend } from '../jobs/processors/campaign-send.processor.js';
import { JOB_STATUSES } from '../jobs/job.constants.js';
import { loadEnv } from '../../config/env.js';

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

/**
 * Dispatches a campaign through the background job queue. Routing the send
 * through the queue makes retries, dead-letter, and operator visibility
 * uniform across send sources (API, scheduler, webhook).
 *
 * Response shape adapts to the queue driver:
 *   - Inline driver (test suite, single-process debugging): the job runs to
 *     completion during the request and we return the same
 *     `{ campaign, summary, tokens }` payload the previous synchronous
 *     endpoint used. Domain errors thrown by the handler (ConflictError,
 *     NotFoundError, etc.) propagate out so the global error middleware
 *     still maps them to the right HTTP status.
 *   - Memory driver (production single-node) and future Redis driver: the
 *     handler returns 202 Accepted with the job id so the client can poll
 *     `/api/v1/admin/jobs/:id` or simply re-fetch the campaign for
 *     progress.
 */
export const sendCampaign = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const job = await enqueueCampaignSend({
    campaignId: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });

  const env = loadEnv();
  if (env.JOB_QUEUE_DRIVER === 'inline' && job.status === JOB_STATUSES.COMPLETED && job.result) {
    return sendSuccess(res, {
      data: { ...job.result, jobId: job._id.toString() },
      message: 'Campaign dispatched',
    });
  }

  return sendSuccess(res, {
    statusCode: HTTP_STATUS.ACCEPTED,
    data: {
      jobId: job._id.toString(),
      status: job.status,
      campaignId: req.params.id,
    },
    message: 'Campaign send queued',
  });
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
