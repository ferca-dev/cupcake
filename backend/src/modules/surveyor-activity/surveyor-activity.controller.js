import * as service from './surveyor-activity.service.js';
import {
  activityExportQuerySchema,
  activityFilterSchema,
  activityListQuerySchema,
  activityMapQuerySchema,
  surveyorIdParamSchema,
} from './surveyor-activity.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { AuthorizationError } from '../../common/errors/index.js';

const requireTenantId = (req) => {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required to view surveyor activity');
  }
  return tenantId;
};

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

export const getSummary = asyncHandler(async (req, res) => {
  const tenantId = requireTenantId(req);
  const filters = activityFilterSchema.parse(req.query ?? {});
  const summary = await service.getSummary({ actor: req.user, tenantId, filters });
  return sendSuccess(res, { data: { summary }, message: 'Surveyor activity summary fetched' });
});

export const listResponses = asyncHandler(async (req, res) => {
  const tenantId = requireTenantId(req);
  const query = activityListQuerySchema.parse(req.query ?? {});
  const { page, limit, ...filters } = query;
  const result = await service.listResponses({
    actor: req.user,
    tenantId,
    filters,
    page,
    limit,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Surveyor activity responses fetched' });
});

export const getMap = asyncHandler(async (req, res) => {
  const tenantId = requireTenantId(req);
  const query = activityMapQuerySchema.parse(req.query ?? {});
  const { limit, ...filters } = query;
  const result = await service.getMapData({
    actor: req.user,
    tenantId,
    filters,
    limit,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Surveyor activity map data fetched' });
});

export const exportActivity = asyncHandler(async (req, res) => {
  const tenantId = requireTenantId(req);
  const query = activityExportQuerySchema.parse(req.query ?? {});
  const { format, limit, ...filters } = query;
  const exported = await service.buildExport({
    actor: req.user,
    tenantId,
    filters,
    format,
    limit,
    ...requestContext(req),
  });

  res.set(
    'Content-Type',
    exported.format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8',
  );
  res.set('Content-Disposition', `attachment; filename="${exported.filename}"`);
  res.set('Cache-Control', 'no-store');
  return res.status(200).send(exported.body);
});

export const getSurveyor = asyncHandler(async (req, res) => {
  const tenantId = requireTenantId(req);
  const surveyorId = surveyorIdParamSchema.parse(req.params.userId);
  const filters = activityFilterSchema.parse(req.query ?? {});
  const result = await service.getSurveyorDetail({ tenantId, filters, surveyorId });
  return sendSuccess(res, { data: result, message: 'Surveyor activity fetched' });
});
