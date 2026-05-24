import mongoose from 'mongoose';

import * as surveyRepo from '../surveys/survey.repository.js';
import * as responseRepo from '../responses/response.repository.js';
import { validateAnswersAgainstSchema } from '../public-forms/answer.validator.js';
import { assertQuota, consumeMonthlyQuota } from '../plans/plan.service.js';
import { QUOTA_KEYS } from '../plans/plan.constants.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/index.js';

export const SURVEYOR_AUDIT_ACTIONS = Object.freeze({
  RESPONSE_SUBMITTED: 'surveyor.response.submitted',
});

const ENTITY_SURVEY_RESPONSE = 'survey_response';

const truncate = (value, max) => (typeof value === 'string' ? value.slice(0, max) : value);

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const requireTenantId = (actor) => {
  if (!actor?.tenantId) {
    throw new ValidationError('Tenant context is required');
  }
  return actor.tenantId;
};

const toSurveyorSurvey = (survey, version = null) => ({
  id: survey._id.toString(),
  tenantId: survey.tenantId.toString(),
  title: survey.title,
  description: survey.description ?? null,
  slug: survey.slug,
  status: survey.status,
  publishedVersionId: survey.publishedVersionId ? survey.publishedVersionId.toString() : null,
  publishedAt: survey.publishedAt ?? null,
  updatedAt: survey.updatedAt,
  version: version
    ? {
        id: version._id.toString(),
        versionNumber: version.versionNumber,
        schema: version.schema,
        settings: version.settings ?? null,
      }
    : null,
  acceptingResponses: survey.status === 'published',
});

const loadSurveyorSurveyContext = async ({ actor, surveyId }) => {
  const tenantId = requireTenantId(actor);
  assertObjectId(surveyId, 'survey id');
  const survey = await surveyRepo.findSurveyById({ id: surveyId, tenantId });
  if (!survey || survey.status !== 'published' || !survey.publishedVersionId) {
    throw new NotFoundError('Survey not found');
  }
  const version = await surveyRepo.findVersionById({
    id: survey.publishedVersionId,
    tenantId,
  });
  if (!version || version.surveyId.toString() !== survey._id.toString()) {
    throw new NotFoundError('Survey version not found');
  }
  return { survey, version, tenantId };
};

const resolveCompletionTimeSeconds = ({ payload, submittedAt }) => {
  const startedAt = payload?.metadata?.startedAt ? new Date(payload.metadata.startedAt) : null;
  const completionTimeSeconds =
    typeof payload?.metadata?.completionTimeSeconds === 'number'
      ? payload.metadata.completionTimeSeconds
      : startedAt && !Number.isNaN(startedAt.getTime())
        ? Math.max(0, Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000))
        : null;
  return {
    startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
    completionTimeSeconds,
  };
};

export const listSurveyorSurveys = async ({ actor, query }) => {
  const tenantId = requireTenantId(actor);
  const result = await surveyRepo.findSurveys({
    tenantId,
    status: 'published',
    search: query.search,
    page: query.page,
    limit: query.limit,
    sort: '-publishedAt',
  });
  return {
    items: result.items.map((survey) => toSurveyorSurvey(survey)),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 0,
    },
  };
};

export const getSurveyorSurvey = async ({ actor, surveyId }) => {
  const { survey, version } = await loadSurveyorSurveyContext({ actor, surveyId });
  return toSurveyorSurvey(survey, version);
};

export const submitSurveyorResponse = async ({
  actor,
  surveyId,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const { survey, version, tenantId } = await loadSurveyorSurveyContext({ actor, surveyId });
  if (survey.status !== 'published') {
    throw new ConflictError('This survey is no longer accepting responses.');
  }

  await assertQuota({ tenantId: tenantId.toString(), quotaKey: QUOTA_KEYS.RESPONSES_MONTHLY });

  const answers = validateAnswersAgainstSchema(version.schema, payload?.answers ?? []);
  const submittedAt = new Date();
  const { startedAt, completionTimeSeconds } = resolveCompletionTimeSeconds({
    payload,
    submittedAt,
  });

  let response;
  try {
    response = await responseRepo.createResponse({
      tenantId: survey.tenantId,
      surveyId: survey._id,
      surveyVersionId: version._id,
      campaignId: null,
      campaignRecipientId: null,
      contactId: null,
      submissionToken: null,
      respondentType: 'surveyor',
      submittedByUserId: actor.id,
      answers,
      metadata: {
        ip: survey.settings?.collectIp ? truncate(ip, 64) : null,
        ipHash: null,
        deviceKeyHash: null,
        contactKeyHash: null,
        userAgent: truncate(userAgent, 500),
        startedAt,
        submittedAt,
        completionTimeSeconds,
      },
    });
  } catch (err) {
    if (err instanceof mongoose.Error.ValidationError) {
      throw new ValidationError('Invalid response payload', [{ message: err.message }]);
    }
    throw err;
  }

  await consumeMonthlyQuota({
    tenantId: survey.tenantId.toString(),
    quotaKey: QUOTA_KEYS.RESPONSES_MONTHLY,
  });

  await recordAuditEvent({
    action: SURVEYOR_AUDIT_ACTIONS.RESPONSE_SUBMITTED,
    entityType: ENTITY_SURVEY_RESPONSE,
    entityId: response._id.toString(),
    userId: actor.id,
    tenantId: survey.tenantId,
    ip,
    userAgent,
    metadata: {
      surveyId: survey._id.toString(),
      surveyVersionId: version._id.toString(),
      answerCount: answers.length,
    },
  });

  return {
    id: response._id.toString(),
    surveyId: survey._id.toString(),
    surveyVersionId: version._id.toString(),
    respondentType: response.respondentType,
    submittedByUserId: response.submittedByUserId.toString(),
    submittedAt,
    thankYouMessage: version.settings?.thankYouMessage ?? survey.settings?.thankYouMessage ?? null,
  };
};
