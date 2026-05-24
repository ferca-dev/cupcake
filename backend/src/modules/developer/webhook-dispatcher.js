import { setTimeout as delay } from 'node:timers/promises';

import { WebhookDelivery } from './webhook-delivery.model.js';
import { WebhookEndpoint } from './webhook-endpoint.model.js';
import {
  EVENT_ID_HEADER,
  EVENT_TYPE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  signWebhookPayload,
} from './webhook-signing.js';
import { logger } from '../../common/utils/logger.js';
import { NotFoundError } from '../../common/errors/index.js';
import { recordOperationalEvent } from '../observability/metrics.service.js';

const ATTEMPT_HISTORY_LIMIT = 20;
const RESPONSE_BODY_SNIPPET_BYTES = 512;
const REQUEST_TIMEOUT_MS = 10_000;
// Exponential backoff with jitter. Indices map to (attempt number - 1).
const BACKOFF_SECONDS = [30, 120, 300, 900, 1800, 3600];

export const computeBackoffSeconds = (attempt) => {
  const idx = Math.min(Math.max(attempt, 1), BACKOFF_SECONDS.length) - 1;
  const base = BACKOFF_SECONDS[idx];
  // ±20% jitter keeps a fleet of webhooks from synchronising their retries.
  const jitter = base * (Math.random() * 0.4 - 0.2);
  return Math.max(15, Math.round(base + jitter));
};

const redactString = (value) => {
  if (typeof value !== 'string') return value;
  if (value.length === 0) return value;
  // Truncate noisy upstream bodies. Sensitive headers are never persisted
  // because we only record the body, not the request headers we sent.
  if (value.length <= RESPONSE_BODY_SNIPPET_BYTES) return value;
  return `${value.slice(0, RESPONSE_BODY_SNIPPET_BYTES)}…`;
};

const performHttpDelivery = async ({ url, signedBody, headers }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: signedBody,
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    return {
      success: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      responseBodySnippet: redactString(text),
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    return {
      success: false,
      statusCode: null,
      responseBodySnippet: null,
      durationMs: Date.now() - startedAt,
      error: err?.name === 'AbortError' ? 'request_timeout' : err?.message || 'delivery_error',
    };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Override hook for tests so the dispatcher can run end-to-end without a
 * real HTTP server. Production code never touches this.
 */
let httpHandler = performHttpDelivery;
export const __setHttpHandler = (handler) => {
  httpHandler = typeof handler === 'function' ? handler : performHttpDelivery;
};
export const __resetHttpHandler = () => {
  httpHandler = performHttpDelivery;
};

const pushAttempt = (delivery, attempt) => {
  const history = Array.isArray(delivery.attemptHistory) ? [...delivery.attemptHistory] : [];
  history.push(attempt);
  if (history.length > ATTEMPT_HISTORY_LIMIT) {
    history.splice(0, history.length - ATTEMPT_HISTORY_LIMIT);
  }
  delivery.attemptHistory = history;
  delivery.lastAttempt = attempt;
  delivery.attempts = attempt.attemptNumber;
};

/**
 * Dispatch a single webhook delivery. The delivery row is updated in place
 * with the attempt outcome. If the attempt fails and the budget allows, the
 * row is scheduled for retry via `nextAttemptAt` and the caller is expected
 * to enqueue a follow-up job. The function never throws for delivery
 * failures — it returns the outcome so the job processor can decide what to
 * do.
 */
export const dispatchDelivery = async ({ deliveryId }) => {
  const delivery = await WebhookDelivery.findById(deliveryId);
  if (!delivery) throw new NotFoundError('Webhook delivery not found');

  const endpoint = await WebhookEndpoint.findById(delivery.endpointId);
  if (!endpoint) {
    // Endpoint was deleted between enqueue and dispatch. Mark the delivery as
    // dead so it does not loop forever.
    delivery.status = 'dead_letter';
    delivery.failedAt = new Date();
    delivery.nextAttemptAt = null;
    await delivery.save();
    return { delivered: false, reason: 'endpoint_missing' };
  }
  if (endpoint.status !== 'active') {
    // Tenant paused the endpoint after we queued the work. Treat as a
    // delivery skip rather than a failure so paused endpoints don't accrue
    // failure counters.
    delivery.status = 'dead_letter';
    delivery.failedAt = new Date();
    delivery.nextAttemptAt = null;
    await delivery.save();
    return { delivered: false, reason: `endpoint_${endpoint.status}` };
  }

  const attemptNumber = (delivery.attempts ?? 0) + 1;
  const startedAt = new Date();

  delivery.status = 'in_progress';
  await delivery.save();

  const body = JSON.stringify({
    id: delivery.eventId,
    type: delivery.eventType,
    createdAt: delivery.createdAt.toISOString(),
    deliveredAttempt: attemptNumber,
    tenantId: delivery.tenantId.toString(),
    data: delivery.payload,
  });
  const signed = signWebhookPayload({ secret: endpoint.secret, body, timestamp: Date.now() });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Cupcake-Webhook/1.0',
    [SIGNATURE_HEADER]: signed.header,
    [EVENT_ID_HEADER]: delivery.eventId,
    [EVENT_TYPE_HEADER]: delivery.eventType,
    [TIMESTAMP_HEADER]: String(signed.timestamp),
  };

  const result = await httpHandler({ url: endpoint.url, signedBody: signed.body, headers });

  const attempt = {
    attemptNumber,
    startedAt,
    completedAt: new Date(),
    durationMs: result.durationMs ?? null,
    statusCode: result.statusCode ?? null,
    success: Boolean(result.success),
    error: result.error ?? null,
    responseBodySnippet: result.responseBodySnippet ?? null,
  };
  pushAttempt(delivery, attempt);

  if (attempt.success) {
    recordOperationalEvent('webhook_deliveries_total', {
      eventType: delivery.eventType,
      status: 'succeeded',
    });
    delivery.status = 'succeeded';
    delivery.deliveredAt = new Date();
    delivery.nextAttemptAt = null;
    await delivery.save();

    endpoint.lastDeliveryAt = new Date();
    endpoint.lastSuccessAt = new Date();
    endpoint.consecutiveFailures = 0;
    await endpoint.save();

    return { delivered: true, attempt };
  }

  endpoint.lastDeliveryAt = new Date();
  endpoint.lastFailureAt = new Date();
  endpoint.consecutiveFailures = (endpoint.consecutiveFailures ?? 0) + 1;
  await endpoint.save();
  recordOperationalEvent('webhook_deliveries_total', {
    eventType: delivery.eventType,
    status: 'failed',
  });

  if (attemptNumber >= (delivery.maxAttempts ?? 5)) {
    delivery.status = 'dead_letter';
    delivery.failedAt = new Date();
    delivery.nextAttemptAt = null;
    await delivery.save();
    logger.warn(
      {
        deliveryId: delivery._id.toString(),
        eventType: delivery.eventType,
        attempts: attemptNumber,
        endpointId: endpoint._id.toString(),
      },
      'Webhook delivery exhausted retries',
    );
    return { delivered: false, attempt, dead: true };
  }

  const backoffSeconds = computeBackoffSeconds(attemptNumber);
  delivery.status = 'failed';
  delivery.nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);
  await delivery.save();

  return { delivered: false, attempt, retryInSeconds: backoffSeconds };
};

// Re-exported helper so tests can wait between concurrent delivery setups
// without importing `timers/promises` themselves.
export const __waitMs = (ms) => delay(ms);
