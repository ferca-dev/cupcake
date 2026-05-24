import * as domainService from './custom-domain.service.js';
import {
  adminListDomainsQuerySchema,
  adminUpdateDomainStatusSchema,
  adminVerifyDomainSchema,
  createDomainSchema,
  listDomainsQuerySchema,
  updateDomainStatusSchema,
} from './custom-domain.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? req.user?.tenantId ?? null;

export const listDomains = asyncHandler(async (req, res) => {
  const query = listDomainsQuerySchema.parse(req.query ?? {});
  const result = await domainService.listDomains({ tenantId: resolveTenantId(req), query });
  return sendSuccess(res, { data: result, message: 'Domains fetched' });
});

export const createDomain = asyncHandler(async (req, res) => {
  const payload = createDomainSchema.parse(req.body ?? {});
  const domain = await domainService.createDomain({
    tenantId: resolveTenantId(req),
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { domain },
    message: 'Domain requested',
  });
});

export const verifyDomain = asyncHandler(async (req, res) => {
  const domain = await domainService.verifyDomain({
    id: req.params.id,
    tenantId: resolveTenantId(req),
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { domain }, message: 'Domain verified' });
});

export const updateDomainStatus = asyncHandler(async (req, res) => {
  const { status } = updateDomainStatusSchema.parse(req.body ?? {});
  const domain = await domainService.updateDomainStatus({
    id: req.params.id,
    tenantId: resolveTenantId(req),
    status,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { domain }, message: 'Domain status updated' });
});

export const deleteDomain = asyncHandler(async (req, res) => {
  const result = await domainService.deleteDomain({
    id: req.params.id,
    tenantId: resolveTenantId(req),
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Domain deleted' });
});

export const adminListDomains = asyncHandler(async (req, res) => {
  const query = adminListDomainsQuerySchema.parse(req.query ?? {});
  const result = await domainService.listAllDomains({ query });
  return sendSuccess(res, { data: result, message: 'Domains fetched' });
});

export const adminVerifyDomain = asyncHandler(async (req, res) => {
  const payload = adminVerifyDomainSchema.parse(req.body ?? {});
  const domain = await domainService.adminVerifyDomain({
    id: req.params.id,
    actor: req.user,
    activate: payload.activate,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { domain }, message: 'Domain verified by admin' });
});

export const adminUpdateDomainStatus = asyncHandler(async (req, res) => {
  const { status } = adminUpdateDomainStatusSchema.parse(req.body ?? {});
  const domain = await domainService.adminUpdateDomainStatus({
    id: req.params.id,
    status,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { domain }, message: 'Domain status updated' });
});
