import * as templateService from './template.service.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
  createSurveyFromTemplateSchema,
} from './template.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

export const listTemplates = asyncHandler(async (req, res) => {
  const query = listTemplatesQuerySchema.parse(req.query ?? {});
  const tenantId = resolveTenantId(req);
  const result = await templateService.listTemplates({
    tenantId,
    isSuperAdmin: req.user.isSuperAdmin,
    ...query,
  });
  return sendSuccess(res, { data: result, message: 'Templates fetched' });
});

export const getTemplate = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const template = await templateService.getTemplate({
    id: req.params.id,
    tenantId,
    isSuperAdmin: req.user.isSuperAdmin,
  });
  return sendSuccess(res, { data: { template }, message: 'Template fetched' });
});

export const createTemplate = asyncHandler(async (req, res) => {
  const payload = createTemplateSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const template = await templateService.createTemplate({
    tenantId,
    actor: req.user,
    payload,
    isSuperAdmin: req.user.isSuperAdmin,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { template },
    message: 'Template created',
  });
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const payload = updateTemplateSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const template = await templateService.updateTemplate({
    id: req.params.id,
    tenantId,
    actor: req.user,
    payload,
    isSuperAdmin: req.user.isSuperAdmin,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { template }, message: 'Template updated' });
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const result = await templateService.deleteTemplate({
    id: req.params.id,
    tenantId,
    actor: req.user,
    isSuperAdmin: req.user.isSuperAdmin,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Template deleted' });
});

export const createSurveyFromTemplate = asyncHandler(async (req, res) => {
  const payload = createSurveyFromTemplateSchema.parse(req.body ?? undefined) ?? {};
  const tenantId = resolveTenantId(req);
  const result = await templateService.createSurveyFromTemplate({
    id: req.params.id,
    tenantId,
    actor: req.user,
    payload,
    isSuperAdmin: req.user.isSuperAdmin,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: result,
    message: 'Survey created from template',
  });
});
