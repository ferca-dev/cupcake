import * as surveyRepo from '../surveys/survey.repository.js';
import * as responseRepo from '../responses/response.repository.js';
import * as campaignRepo from '../campaigns/campaign.repository.js';
import { ConflictError, NotFoundError } from '../../common/errors/index.js';
import { validateAnswersAgainstSchema } from './answer.validator.js';

const PUBLIC_VIEW_STATUSES = new Set(['published', 'paused']);

const toPublicSchemaView = ({ survey, version }) => ({
  survey: {
    id: survey._id.toString(),
    slug: survey.slug,
    title: survey.title,
    description: survey.description ?? null,
    status: survey.status,
    settings: {
      allowAnonymous: Boolean(survey.settings?.allowAnonymous),
      requireContactData: Boolean(survey.settings?.requireContactData),
      thankYouMessage: survey.settings?.thankYouMessage ?? null,
      closeMessage: survey.settings?.closeMessage ?? null,
      pausedMessage: survey.settings?.pausedMessage ?? null,
      oneResponsePerContact: Boolean(survey.settings?.oneResponsePerContact),
      collectIp: Boolean(survey.settings?.collectIp),
    },
  },
  version: {
    id: version._id.toString(),
    versionNumber: version.versionNumber,
    schema: version.schema,
  },
  acceptingResponses: survey.status === 'published',
  pausedMessage: survey.status === 'paused' ? (survey.settings?.pausedMessage ?? null) : null,
});

const loadPublishedSurveyContext = async (slug) => {
  const survey = await surveyRepo.findSurveyBySlug(slug);
  if (!survey) {
    throw new NotFoundError('Survey not found');
  }
  if (!PUBLIC_VIEW_STATUSES.has(survey.status)) {
    // draft/archived surveys are not visible at all on the public surface
    throw new NotFoundError('Survey not found');
  }
  if (!survey.publishedVersionId) {
    throw new NotFoundError('Survey not found');
  }
  const version = await surveyRepo.findVersionById({
    id: survey.publishedVersionId,
    tenantId: survey.tenantId,
  });
  if (!version) {
    throw new NotFoundError('Survey version not found');
  }
  return { survey, version };
};

export const getPublicForm = async ({ slug }) => {
  const ctx = await loadPublishedSurveyContext(slug);
  return toPublicSchemaView(ctx);
};

export const getPublicFormByToken = async ({ slug, submissionToken }) => {
  const ctx = await loadPublishedSurveyContext(slug);
  // A token without a matching recipient is still accepted (the frontend can
  // submit responses with `allowAnonymous`) but campaign association requires
  // a real recipient. We surface the recipient channel/contact when found so
  // the renderer can pre-fill or display context.
  const recipient = await campaignRepo.findRecipientByToken({
    submissionToken,
    tenantId: ctx.survey.tenantId,
  });
  return {
    ...toPublicSchemaView(ctx),
    submissionToken,
    recipient: recipient
      ? {
          id: recipient._id.toString(),
          campaignId: recipient.campaignId.toString(),
          channel: recipient.channel,
          contactId: recipient.contactId ? recipient.contactId.toString() : null,
        }
      : null,
  };
};

const truncate = (value, max) => (typeof value === 'string' ? value.slice(0, max) : value);

export const submitPublicResponse = async ({
  slug,
  submissionToken = null,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const { survey, version } = await loadPublishedSurveyContext(slug);

  if (survey.status === 'paused') {
    throw new ConflictError(survey.settings?.pausedMessage ?? 'This survey is temporarily paused.');
  }
  if (survey.status !== 'published') {
    throw new ConflictError('This survey is no longer accepting responses.');
  }
  if (!survey.settings?.allowAnonymous && !submissionToken) {
    throw new ConflictError('This survey requires a personal submission link.');
  }

  const answers = validateAnswersAgainstSchema(version.schema, payload?.answers ?? []);

  // Match the token to a campaign recipient so the submitted response carries
  // campaign/recipient context for reporting and the recipient state moves to
  // `clicked` to mark engagement.
  const recipient = submissionToken
    ? await campaignRepo.findRecipientByToken({
        submissionToken,
        tenantId: survey.tenantId,
      })
    : null;

  const submittedAt = new Date();
  const startedAt = payload?.metadata?.startedAt ? new Date(payload.metadata.startedAt) : null;
  const completionTimeSeconds =
    typeof payload?.metadata?.completionTimeSeconds === 'number'
      ? payload.metadata.completionTimeSeconds
      : startedAt && !Number.isNaN(startedAt.getTime())
        ? Math.max(0, Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000))
        : null;

  const response = await responseRepo.createResponse({
    tenantId: survey.tenantId,
    surveyId: survey._id,
    surveyVersionId: version._id,
    campaignId: recipient ? recipient.campaignId : null,
    campaignRecipientId: recipient ? recipient._id : null,
    contactId: recipient ? (recipient.contactId ?? null) : null,
    submissionToken: submissionToken ?? null,
    answers,
    metadata: {
      ip: survey.settings?.collectIp ? truncate(ip, 64) : null,
      userAgent: truncate(userAgent, 500),
      startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
      submittedAt,
      completionTimeSeconds,
    },
  });

  if (recipient && ['sent', 'delivered'].includes(recipient.status)) {
    recipient.status = 'clicked';
    recipient.clickedAt = submittedAt;
    await recipient.save();
  }

  return {
    id: response._id.toString(),
    surveyId: survey._id.toString(),
    surveyVersionId: version._id.toString(),
    submittedAt,
    thankYouMessage: survey.settings?.thankYouMessage ?? null,
  };
};
