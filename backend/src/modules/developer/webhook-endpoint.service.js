import { WebhookEndpoint } from './webhook-endpoint.model.js';
import { WebhookDelivery } from './webhook-delivery.model.js';
import { generateWebhookSecret } from './webhook-signing.js';
import { dispatchTestEvent } from './webhook-publisher.js';
import { WEBHOOK_EVENT_TYPES, isValidWebhookEventType } from './webhook-events.js';
import { NotFoundError, ValidationError } from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-cupcake-signature',
]);

const ensureTenant = (tenantId) => {
  if (!tenantId) throw new ValidationError('Tenant context is required');
  return tenantId.toString();
};

const sanitiseAttempt = (attempt) => {
  if (!attempt) return null;
  const plain = typeof attempt.toObject === 'function' ? attempt.toObject() : { ...attempt };
  if (plain.responseBodySnippet && typeof plain.responseBodySnippet === 'string') {
    // Response bodies are already truncated by the dispatcher but we re-redact
    // any header-shaped substrings defensively so the API never echoes back
    // accidentally-included secrets from misconfigured receivers.
    plain.responseBodySnippet = redactSnippet(plain.responseBodySnippet);
  }
  return plain;
};

const redactSnippet = (snippet) => {
  if (typeof snippet !== 'string') return snippet;
  return snippet.replace(/([\w-]+):\s*([^\r\n]+)/gi, (match, header) => {
    if (SENSITIVE_HEADERS.has(String(header).toLowerCase())) {
      return `${header}: [redacted]`;
    }
    return match;
  });
};

export const toPublicEndpoint = (doc, { includeSecret = false } = {}) => {
  const data = {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    name: doc.name,
    description: doc.description ?? null,
    url: doc.url,
    events: [...doc.events],
    status: doc.status,
    createdBy: doc.createdBy?.toString() ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastDeliveryAt: doc.lastDeliveryAt ?? null,
    lastSuccessAt: doc.lastSuccessAt ?? null,
    lastFailureAt: doc.lastFailureAt ?? null,
    consecutiveFailures: doc.consecutiveFailures ?? 0,
  };
  if (includeSecret) data.secret = doc.secret;
  return data;
};

export const toPublicDelivery = (doc) => {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    endpointId: doc.endpointId.toString(),
    eventId: doc.eventId,
    eventType: doc.eventType,
    status: doc.status,
    attempts: doc.attempts ?? 0,
    maxAttempts: doc.maxAttempts ?? 5,
    nextAttemptAt: doc.nextAttemptAt ?? null,
    deliveredAt: doc.deliveredAt ?? null,
    failedAt: doc.failedAt ?? null,
    lastAttempt: sanitiseAttempt(doc.lastAttempt),
    attemptHistory: Array.isArray(doc.attemptHistory)
      ? doc.attemptHistory.map(sanitiseAttempt)
      : [],
    triggeredBy: doc.triggeredBy ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

export const createEndpoint = async ({ tenantId, payload, actor }) => {
  const tenant = ensureTenant(tenantId);
  if (!actor?.id) throw new ValidationError('Actor is required to create a webhook endpoint');

  const secret = generateWebhookSecret();
  const doc = await WebhookEndpoint.create({
    tenantId: tenant,
    name: payload.name.trim(),
    description: payload.description?.trim() ?? null,
    url: payload.url.trim(),
    secret,
    events: payload.events,
    status: payload.status ?? 'active',
    createdBy: actor.id,
  });

  await recordAuditEvent({
    action: 'webhook_endpoint.created',
    entityType: 'webhook_endpoint',
    entityId: doc._id.toString(),
    tenantId: tenant,
    userId: actor.id,
    metadata: { url: doc.url, events: doc.events, status: doc.status },
  });

  return toPublicEndpoint(doc, { includeSecret: true });
};

export const listEndpoints = async ({ tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const docs = await WebhookEndpoint.find({ tenantId: tenant }).sort({ createdAt: -1 });
  return docs.map((doc) => toPublicEndpoint(doc));
};

export const getEndpoint = async ({ tenantId, id }) => {
  const tenant = ensureTenant(tenantId);
  const doc = await WebhookEndpoint.findOne({ _id: id, tenantId: tenant });
  if (!doc) throw new NotFoundError('Webhook endpoint not found');
  return toPublicEndpoint(doc);
};

export const updateEndpoint = async ({ tenantId, id, payload, actor }) => {
  const tenant = ensureTenant(tenantId);
  if (!actor?.id) throw new ValidationError('Actor is required to update a webhook endpoint');

  const doc = await WebhookEndpoint.findOne({ _id: id, tenantId: tenant });
  if (!doc) throw new NotFoundError('Webhook endpoint not found');

  let secretRotated = false;
  if (payload.name !== undefined) doc.name = payload.name.trim();
  if (payload.description !== undefined)
    doc.description = payload.description ? payload.description.trim() : null;
  if (payload.url !== undefined) doc.url = payload.url.trim();
  if (payload.events !== undefined) doc.events = payload.events;
  if (payload.status !== undefined) doc.status = payload.status;
  if (payload.rotateSecret === true) {
    doc.secret = generateWebhookSecret();
    secretRotated = true;
  }
  await doc.save();

  await recordAuditEvent({
    action: 'webhook_endpoint.updated',
    entityType: 'webhook_endpoint',
    entityId: doc._id.toString(),
    tenantId: tenant,
    userId: actor.id,
    metadata: {
      url: doc.url,
      events: doc.events,
      status: doc.status,
      secretRotated,
    },
  });

  return toPublicEndpoint(doc, { includeSecret: secretRotated });
};

export const deleteEndpoint = async ({ tenantId, id, actor }) => {
  const tenant = ensureTenant(tenantId);
  if (!actor?.id) throw new ValidationError('Actor is required to delete a webhook endpoint');
  const doc = await WebhookEndpoint.findOne({ _id: id, tenantId: tenant });
  if (!doc) throw new NotFoundError('Webhook endpoint not found');
  await WebhookEndpoint.deleteOne({ _id: doc._id });

  // Deliveries are kept for history so the audit trail survives endpoint
  // removal. The dispatcher already handles the "endpoint missing" case by
  // marking pending deliveries as dead-lettered.

  await recordAuditEvent({
    action: 'webhook_endpoint.deleted',
    entityType: 'webhook_endpoint',
    entityId: doc._id.toString(),
    tenantId: tenant,
    userId: actor.id,
    metadata: { url: doc.url },
  });

  return { id: doc._id.toString(), deleted: true };
};

export const listDeliveries = async ({ tenantId, endpointId, query = {} }) => {
  const tenant = ensureTenant(tenantId);
  const endpoint = await WebhookEndpoint.findOne({ _id: endpointId, tenantId: tenant });
  if (!endpoint) throw new NotFoundError('Webhook endpoint not found');

  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 25)));
  const filter = { tenantId: tenant, endpointId: endpoint._id };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    WebhookDelivery.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    WebhookDelivery.countDocuments(filter),
  ]);

  return {
    items: items.map(toPublicDelivery),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const sendTestEvent = async ({ tenantId, endpointId, payload, actor }) => {
  const tenant = ensureTenant(tenantId);
  if (!actor?.id) throw new ValidationError('Actor is required to send a test event');

  const endpoint = await WebhookEndpoint.findOne({ _id: endpointId, tenantId: tenant });
  if (!endpoint) throw new NotFoundError('Webhook endpoint not found');
  if (endpoint.status !== 'active') {
    throw new ValidationError('Endpoint must be active to send a test event');
  }

  const type = payload?.type ?? WEBHOOK_EVENT_TYPES.RESPONSE_SUBMITTED;
  if (!isValidWebhookEventType(type)) {
    throw new ValidationError(`Unknown event type: ${type}`);
  }
  const data = payload?.data ?? {
    test: true,
    note: 'Manual test event from the Cupcake developer console',
    sentAt: new Date().toISOString(),
  };

  const result = await dispatchTestEvent({
    endpoint,
    type,
    data,
    triggeredBy: `manual_test:${actor.id}`,
  });

  await recordAuditEvent({
    action: 'webhook_endpoint.test_sent',
    entityType: 'webhook_endpoint',
    entityId: endpoint._id.toString(),
    tenantId: tenant,
    userId: actor.id,
    metadata: {
      eventType: type,
      delivered: result.result?.delivered ?? false,
      statusCode: result.result?.attempt?.statusCode ?? null,
    },
  });

  return {
    delivered: result.result?.delivered ?? false,
    delivery: toPublicDelivery(result.delivery),
    attempt: sanitiseAttempt(result.result?.attempt ?? null),
  };
};
