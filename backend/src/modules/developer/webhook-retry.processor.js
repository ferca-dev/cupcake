import { dispatchDelivery } from './webhook-dispatcher.js';
import { enqueueJob } from '../jobs/job.service.js';
import { JOB_TYPES } from '../jobs/job.constants.js';
import { registerJobHandler } from '../jobs/job.registry.js';

/**
 * Job handler for `webhook.retry`. Runs a single dispatch attempt. When the
 * attempt fails and the delivery row still has retry budget left, we
 * re-enqueue the same job with the backoff the dispatcher already wrote to
 * `nextAttemptAt`. This keeps the retry policy in one place (the dispatcher)
 * and makes the processor a thin shim.
 */
const webhookRetryHandler = async (payload) => {
  const deliveryId = payload?.deliveryId;
  if (!deliveryId) {
    return { status: 'skipped', reason: 'missing_delivery_id' };
  }
  const outcome = await dispatchDelivery({ deliveryId });

  if (!outcome.delivered && outcome.retryInSeconds && !outcome.dead) {
    await enqueueJob({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: { deliveryId },
      delaySeconds: outcome.retryInSeconds,
      // Each retry attempt is a fresh job so the queue can reorder it; the
      // dedupe key uses the attempt number so we never collapse a retry
      // back into the original enqueue.
      dedupeKey: `webhook:delivery:${deliveryId}:retry:${outcome.attempt?.attemptNumber ?? 'n'}`,
    });
  }

  return {
    deliveryId,
    delivered: outcome.delivered ?? false,
    dead: outcome.dead ?? false,
    statusCode: outcome.attempt?.statusCode ?? null,
    retryInSeconds: outcome.retryInSeconds ?? null,
  };
};

export const registerWebhookRetryProcessor = () => {
  registerJobHandler(JOB_TYPES.WEBHOOK_RETRY, webhookRetryHandler);
};

export const __testing = { webhookRetryHandler };
