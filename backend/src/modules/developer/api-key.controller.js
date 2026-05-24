import { ZodError } from 'zod';

import * as service from './api-key.service.js';
import { createApiKeySchema } from './api-key.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';
import { ValidationError } from '../../common/errors/index.js';

const parseBody = (schema, body) => {
  try {
    return schema.parse(body ?? {});
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationError('Invalid API key payload', err.issues);
    }
    throw err;
  }
};

const actorFromRequest = (req) => ({ id: req.user?.id, role: req.user?.role });

export const list = asyncHandler(async (req, res) => {
  const items = await service.listApiKeys({ tenantId: req.tenantContext.tenantId });
  return sendSuccess(res, { data: { items }, message: 'API keys fetched' });
});

export const create = asyncHandler(async (req, res) => {
  const payload = parseBody(createApiKeySchema, req.body);
  const result = await service.createApiKey({
    tenantId: req.tenantContext.tenantId,
    name: payload.name,
    description: payload.description ?? null,
    scopes: payload.scopes,
    expiresAt: payload.expiresAt ?? null,
    actor: actorFromRequest(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { apiKey: result },
    message: 'API key created. Copy the raw key now — it cannot be retrieved later.',
  });
});

export const rotate = asyncHandler(async (req, res) => {
  const result = await service.rotateApiKey({
    tenantId: req.tenantContext.tenantId,
    id: req.params.id,
    actor: actorFromRequest(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: result,
    message: 'API key rotated. The previous key has been revoked.',
  });
});

export const revoke = asyncHandler(async (req, res) => {
  const result = await service.revokeApiKey({
    tenantId: req.tenantContext.tenantId,
    id: req.params.id,
    actor: actorFromRequest(req),
  });
  return sendSuccess(res, {
    data: { apiKey: result },
    message: 'API key revoked',
  });
});

export const destroy = asyncHandler(async (req, res) => {
  const result = await service.deleteApiKey({
    tenantId: req.tenantContext.tenantId,
    id: req.params.id,
    actor: actorFromRequest(req),
  });
  return sendSuccess(res, { data: result, message: 'API key deleted' });
});
