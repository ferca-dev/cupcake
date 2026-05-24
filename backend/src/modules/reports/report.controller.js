import * as reportService from './report.service.js';
import { reportFilterSchema, reportExportQuerySchema } from './report.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { AuthorizationError } from '../../common/errors/index.js';

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;
const resolveSurveyId = (req) => req.params.id ?? req.params.surveyId;

const requireTenant = (req) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    throw new AuthorizationError(
      'Tenant context is required to read survey reports (super admins must select a tenant)',
    );
  }
  return tenantId;
};

const parseFilters = (req) => reportFilterSchema.parse(req.query ?? {});

export const getOverview = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const filters = parseFilters(req);
  const report = await reportService.getOverviewReport({
    surveyId: resolveSurveyId(req),
    tenantId,
    filters,
  });
  return sendSuccess(res, { data: { report }, message: 'Overview report fetched' });
});

export const getChannels = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const filters = parseFilters(req);
  const report = await reportService.getChannelsReport({
    surveyId: resolveSurveyId(req),
    tenantId,
    filters,
  });
  return sendSuccess(res, { data: { report }, message: 'Channels report fetched' });
});

export const getQuestions = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const filters = parseFilters(req);
  const report = await reportService.getQuestionsReport({
    surveyId: resolveSurveyId(req),
    tenantId,
    filters,
  });
  return sendSuccess(res, { data: { report }, message: 'Questions report fetched' });
});

export const getTrends = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const filters = parseFilters(req);
  const report = await reportService.getTrendsReport({
    surveyId: resolveSurveyId(req),
    tenantId,
    filters,
  });
  return sendSuccess(res, { data: { report }, message: 'Trends report fetched' });
});

export const getDropOff = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const filters = parseFilters(req);
  const report = await reportService.getDropOffReport({
    surveyId: resolveSurveyId(req),
    tenantId,
    filters,
  });
  return sendSuccess(res, { data: { report }, message: 'Drop-off report fetched' });
});

export const getTiming = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const filters = parseFilters(req);
  const report = await reportService.getTimingReport({
    surveyId: resolveSurveyId(req),
    tenantId,
    filters,
  });
  return sendSuccess(res, { data: { report }, message: 'Timing report fetched' });
});

export const getVersions = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const filters = parseFilters(req);
  const report = await reportService.getVersionsReport({
    surveyId: resolveSurveyId(req),
    tenantId,
    filters,
  });
  return sendSuccess(res, { data: { report }, message: 'Versions report fetched' });
});

export const exportReport = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  // Split filter params from export-specific params so each schema receives
  // the keys it expects. Unknown keys are silently ignored.
  const { type, format, limit, ...filterCandidates } = req.query ?? {};
  const filters = reportFilterSchema.parse(filterCandidates);
  const options = reportExportQuerySchema.parse({ type, format, limit });

  const exported = await reportService.buildExport({
    surveyId: resolveSurveyId(req),
    tenantId,
    filters,
    options,
  });

  const contentType =
    exported.format === 'json'
      ? 'application/json; charset=utf-8'
      : exported.format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8';

  res.set('Content-Type', contentType);
  res.set('Content-Disposition', `attachment; filename="${exported.filename}"`);
  res.set('Cache-Control', 'no-store');
  return res.status(200).send(exported.body);
});
