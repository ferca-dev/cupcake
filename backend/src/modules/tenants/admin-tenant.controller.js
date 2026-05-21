import * as service from './admin-tenant.service.js';
import {
  listTenantsQuerySchema,
  createTenantSchema,
  updateTenantSchema,
  updateTenantStatusSchema,
} from './tenant.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

export const listTenants = asyncHandler(async (req, res) => {
  const query = listTenantsQuerySchema.parse(req.query ?? {});
  const result = await service.listTenants(query);
  return sendSuccess(res, { data: result, message: 'Tenants fetched' });
});

export const getTenant = asyncHandler(async (req, res) => {
  const tenant = await service.getTenant({ id: req.params.id });
  return sendSuccess(res, { data: { tenant }, message: 'Tenant fetched' });
});

export const createTenant = asyncHandler(async (req, res) => {
  const payload = createTenantSchema.parse(req.body ?? {});
  const tenant = await service.createTenant({
    payload,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { tenant },
    message: 'Tenant created',
  });
});

export const updateTenant = asyncHandler(async (req, res) => {
  const payload = updateTenantSchema.parse(req.body ?? {});
  const tenant = await service.updateTenant({
    id: req.params.id,
    payload,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { tenant }, message: 'Tenant updated' });
});

export const updateTenantStatus = asyncHandler(async (req, res) => {
  const payload = updateTenantStatusSchema.parse(req.body ?? {});
  const result = await service.updateTenantStatus({
    id: req.params.id,
    payload,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Tenant status updated' });
});

export const listTenantUsers = asyncHandler(async (req, res) => {
  const result = await service.listTenantUsers({ id: req.params.id });
  return sendSuccess(res, { data: result, message: 'Tenant users fetched' });
});
