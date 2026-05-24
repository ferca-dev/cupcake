import * as campaignService from '../../campaigns/campaign.service.js';
import { ValidationError } from '../../../common/errors/index.js';
import { JOB_TYPES } from '../job.constants.js';
import { registerJobHandler } from '../job.registry.js';
import { enqueueJob } from '../job.service.js';

/**
 * Sends a campaign asynchronously. The processor is intentionally a thin
 * wrapper around the existing service so the dispatch logic — including
 * preflight balance checks and recipient planning — has a single source of
 * truth.
 *
 * Idempotency: combined with the `dedupeKey` of `campaign.send:<campaignId>`,
 * two near-simultaneous enqueue attempts collapse into the same job
 * document, and the underlying service throws ConflictError if the campaign
 * has already reached a terminal status. The job is configured with
 * `maxAttempts: 1` because a partial send mid-execution leaves the campaign
 * in `sending`, and the service refuses to re-process it. Operators are
 * expected to inspect the campaign and decide whether to requeue manually
 * through the admin jobs API.
 *
 * Errors propagate untouched so the inline driver can hand them back to the
 * Express error handler and surface the correct HTTP status to the client.
 */
const handler = async (payload, { job }) => {
  const { campaignId, tenantId, actor = null, ip = null, userAgent = null } = payload ?? {};
  if (!campaignId) throw new ValidationError('campaign.send job missing campaignId');
  if (!tenantId) throw new ValidationError('campaign.send job missing tenantId');

  return campaignService.sendCampaign({
    id: campaignId,
    tenantId,
    actor: actor ?? { id: job.enqueuedBy?.toString() ?? null },
    ip,
    userAgent,
  });
};

export const enqueueCampaignSend = ({
  campaignId,
  tenantId,
  actor = null,
  ip = null,
  userAgent = null,
}) =>
  enqueueJob({
    type: JOB_TYPES.CAMPAIGN_SEND,
    tenantId,
    payload: {
      campaignId: campaignId.toString(),
      tenantId: tenantId.toString(),
      actor: actor ? { id: actor.id?.toString?.() ?? actor.id ?? null } : null,
      ip,
      userAgent,
    },
    dedupeKey: `campaign.send:${campaignId.toString()}`,
    maxAttempts: 1,
    enqueuedBy: actor?.id ?? null,
  });

export const register = () => registerJobHandler(JOB_TYPES.CAMPAIGN_SEND, handler);

export const __testing = { handler };
