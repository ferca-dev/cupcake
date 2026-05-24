import { ZodError } from 'zod';

import * as service from './webhook-endpoint.service.js';
import {
  createWebhookEndpointSchema,
  updateWebhookEndpointSchema,
  testWebhookSchema,
  listDeliveriesQuerySchema,
} from './webhook-endpoint.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';
import { ValidationError } from '../../common/errors/index.js';

const parseBody = (schema, body) => {
  try {
    return schema.parse(body ?? {});
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationError('Invalid webhook payload', err.issues);
    }
    throw err;
  }
};

const actor = (req) => ({ id: req.user?.id, role: req.user?.role });

export const list = asyncHandler(async (req, res) => {
  const items = await service.listEndpoints({ tenantId: req.tenantContext.tenantId });
  return sendSuccess(res, { data: { items }, message: 'Webhook endpoints fetched' });
});

export const create = asyncHandler(async (req, res) => {
  const payload = parseBody(createWebhookEndpointSchema, req.body);
  const endpoint = await service.createEndpoint({
    tenantId: req.tenantContext.tenantId,
    payload,
    actor: actor(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { endpoint },
    message: 'Webhook endpoint created. Store the secret now — it cannot be retrieved later.',
  });
});

export const update = asyncHandler(async (req, res) => {
  const payload = parseBody(updateWebhookEndpointSchema, req.body);
  const endpoint = await service.updateEndpoint({
    tenantId: req.tenantContext.tenantId,
    id: req.params.id,
    payload,
    actor: actor(req),
  });
  return sendSuccess(res, {
    data: { endpoint },
    message: payload.rotateSecret
      ? 'Webhook endpoint updated. A new secret has been generated.'
      : 'Webhook endpoint updated',
  });
});

export const destroy = asyncHandler(async (req, res) => {
  const result = await service.deleteEndpoint({
    tenantId: req.tenantContext.tenantId,
    id: req.params.id,
    actor: actor(req),
  });
  return sendSuccess(res, { data: result, message: 'Webhook endpoint deleted' });
});

export const listDeliveries = asyncHandler(async (req, res) => {
  const query = parseBody(listDeliveriesQuerySchema, req.query);
  const result = await service.listDeliveries({
    tenantId: req.tenantContext.tenantId,
    endpointId: req.params.id,
    query,
  });
  return sendSuccess(res, { data: result, message: 'Webhook deliveries fetched' });
});

export const sendTest = asyncHandler(async (req, res) => {
  const payload = parseBody(testWebhookSchema, req.body);
  const result = await service.sendTestEvent({
    tenantId: req.tenantContext.tenantId,
    endpointId: req.params.id,
    payload,
    actor: actor(req),
  });
  return sendSuccess(res, { data: result, message: 'Test event dispatched' });
});
