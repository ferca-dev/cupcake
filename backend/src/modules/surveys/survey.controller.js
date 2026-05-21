import * as surveyService from './survey.service.js';
import {
  createSurveySchema,
  updateSurveySchema,
  listSurveysQuerySchema,
  duplicateSurveySchema,
} from './survey.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

/**
 * Returns the tenant id the request should operate under. For tenant-bound
 * users this is always their tenant; for super admins it is the impersonated
 * tenant (set by `requireTenantContext`) or `null` to read across tenants.
 */
const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

export const listSurveys = asyncHandler(async (req, res) => {
  const query = listSurveysQuerySchema.parse(req.query ?? {});
  const tenantId = resolveTenantId(req);
  const result = await surveyService.listSurveys({ tenantId, ...query });
  return sendSuccess(res, {
    data: result,
    message: 'Surveys fetched',
  });
});

export const getSurvey = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const survey = await surveyService.getSurvey({
    id: req.params.id,
    tenantId,
    allowSuperAdminGlobal: req.user.isSuperAdmin,
  });
  return sendSuccess(res, { data: { survey }, message: 'Survey fetched' });
});

export const createSurvey = asyncHandler(async (req, res) => {
  const payload = createSurveySchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const survey = await surveyService.createSurvey({
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { survey },
    message: 'Survey created',
  });
});

export const updateSurvey = asyncHandler(async (req, res) => {
  const payload = updateSurveySchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const survey = await surveyService.updateSurvey({
    id: req.params.id,
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { survey }, message: 'Survey updated' });
});

export const deleteSurvey = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const result = await surveyService.deleteSurvey({
    id: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Survey deleted' });
});

export const publishSurvey = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const result = await surveyService.publishSurvey({
    id: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Survey published' });
});

export const pauseSurvey = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const survey = await surveyService.pauseSurvey({
    id: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { survey }, message: 'Survey paused' });
});

export const archiveSurvey = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const survey = await surveyService.archiveSurvey({
    id: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { survey }, message: 'Survey archived' });
});

export const duplicateSurvey = asyncHandler(async (req, res) => {
  const payload = duplicateSurveySchema.parse(req.body ?? undefined) ?? {};
  const tenantId = resolveTenantId(req);
  const survey = await surveyService.duplicateSurvey({
    id: req.params.id,
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { survey },
    message: 'Survey duplicated',
  });
});

export const listVersions = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const versions = await surveyService.listVersions({
    id: req.params.id,
    tenantId,
  });
  return sendSuccess(res, { data: { versions }, message: 'Survey versions fetched' });
});

export const getStats = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const stats = await surveyService.getSurveyStats({
    id: req.params.id,
    tenantId,
  });
  return sendSuccess(res, { data: { stats }, message: 'Survey stats fetched' });
});
