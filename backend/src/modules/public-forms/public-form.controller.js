import * as publicFormService from './public-form.service.js';
import {
  submitResponseSchema,
  submissionTokenParamSchema,
  publicSlugParamSchema,
} from './public-form.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

export const getPublicForm = asyncHandler(async (req, res) => {
  const slug = publicSlugParamSchema.parse(req.params.slug);
  const result = await publicFormService.getPublicForm({ slug });
  return sendSuccess(res, { data: result, message: 'Public form fetched' });
});

export const getPublicFormByToken = asyncHandler(async (req, res) => {
  const slug = publicSlugParamSchema.parse(req.params.slug);
  const submissionToken = submissionTokenParamSchema.parse(req.params.submissionToken);
  const result = await publicFormService.getPublicFormByToken({ slug, submissionToken });
  return sendSuccess(res, { data: result, message: 'Public form fetched' });
});

export const submitPublicResponse = asyncHandler(async (req, res) => {
  const slug = publicSlugParamSchema.parse(req.params.slug);
  const payload = submitResponseSchema.parse(req.body ?? {});
  const submissionToken = req.body?.submissionToken
    ? submissionTokenParamSchema.parse(req.body.submissionToken)
    : null;

  const result = await publicFormService.submitPublicResponse({
    slug,
    submissionToken,
    payload,
    ...requestContext(req),
  });

  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { response: result },
    message: 'Response submitted',
  });
});
