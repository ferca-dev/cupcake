import { randomUUID } from 'node:crypto';

import { WebhookDelivery } from './webhook-delivery.model.js';
import { WebhookEndpoint } from './webhook-endpoint.model.js';
import { dispatchDelivery } from './webhook-dispatcher.js';
import { enqueueJob } from '../jobs/job.service.js';
import { JOB_TYPES } from '../jobs/job.constants.js';
import { isValidWebhookEventType } from './webhook-events.js';
import { logger } from '../../common/utils/logger.js';
import { loadEnv } from '../../config/env.js';

const safeTenantId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') return value.toString();
  return null;
};

/**
 * Public entry point for producers (responses, campaigns, payments, tokens,
 * subscriptions). Looks up every active endpoint subscribed to the event
 * type in the tenant, persists one `WebhookDelivery` row per subscription,
 * and enqueues a retryable job to perform the HTTP call.
 *
 * The function never throws for missing endpoints or job failures — producer
 * code should not pay for integration outages. Validation problems (unknown
 * event type, missing tenant) are logged at WARN level instead.
 */
export const publishWebhookEvent = async ({
  type,
  tenantId,
  data,
  triggeredBy = 'system',
  eventId = null,
}) => {
  if (!isValidWebhookEventType(type)) {
    logger.warn({ type }, 'publishWebhookEvent called with unknown event type');
    return { enqueued: 0 };
  }
  const tenant = safeTenantId(tenantId);
  if (!tenant) {
    logger.warn({ type }, 'publishWebhookEvent called without tenantId');
    return { enqueued: 0 };
  }

  let endpoints;
  try {
    endpoints = await WebhookEndpoint.find({
      tenantId: tenant,
      status: 'active',
      events: type,
    });
  } catch (err) {
    logger.warn({ err, type, tenantId: tenant }, 'Failed to load webhook endpoints');
    return { enqueued: 0 };
  }

  if (endpoints.length === 0) return { enqueued: 0 };

  const env = loadEnv();
  let enqueued = 0;

  for (const endpoint of endpoints) {
    try {
      const delivery = await WebhookDelivery.create({
        tenantId: tenant,
        endpointId: endpoint._id,
        eventId: eventId ?? randomUUID(),
        eventType: type,
        payload: data ?? {},
        status: 'pending',
        attempts: 0,
        maxAttempts: env.JOB_MAX_ATTEMPTS ?? 5,
        nextAttemptAt: new Date(),
        triggeredBy,
      });

      await enqueueJob({
        type: JOB_TYPES.WEBHOOK_RETRY,
        tenantId: tenant,
        payload: { deliveryId: delivery._id.toString() },
        dedupeKey: `webhook:delivery:${delivery._id.toString()}`,
      });
      enqueued += 1;
    } catch (err) {
      logger.warn(
        { err, type, tenantId: tenant, endpointId: endpoint._id.toString() },
        'Failed to enqueue webhook delivery',
      );
    }
  }

  return { enqueued };
};

/**
 * Convenience wrapper used by the "Test event" endpoint. Creates a delivery
 * row tied to a single endpoint and runs the dispatch inline so the caller
 * can return the attempt outcome immediately.
 */
export const dispatchTestEvent = async ({ endpoint, type, data, triggeredBy = 'manual_test' }) => {
  const env = loadEnv();
  const delivery = await WebhookDelivery.create({
    tenantId: endpoint.tenantId,
    endpointId: endpoint._id,
    eventId: randomUUID(),
    eventType: type,
    payload: data ?? {},
    status: 'pending',
    attempts: 0,
    maxAttempts: env.JOB_MAX_ATTEMPTS ?? 5,
    nextAttemptAt: new Date(),
    triggeredBy,
  });

  const result = await dispatchDelivery({ deliveryId: delivery._id });
  const refreshed = await WebhookDelivery.findById(delivery._id);
  return { delivery: refreshed, result };
};
