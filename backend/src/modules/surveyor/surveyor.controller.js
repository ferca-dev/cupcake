import * as surveyorService from './surveyor.service.js';
import {
  listSurveyorSurveysQuerySchema,
  submitSurveyorResponseSchema,
  surveyorSurveyIdSchema,
} from './surveyor.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

export const listSurveys = asyncHandler(async (req, res) => {
  const query = listSurveyorSurveysQuerySchema.parse(req.query ?? {});
  const result = await surveyorService.listSurveyorSurveys({ actor: req.user, query });
  return sendSuccess(res, { data: result, message: 'Surveyor surveys fetched' });
});

export const getSurvey = asyncHandler(async (req, res) => {
  const surveyId = surveyorSurveyIdSchema.parse(req.params.id);
  const survey = await surveyorService.getSurveyorSurvey({ actor: req.user, surveyId });
  return sendSuccess(res, { data: { survey }, message: 'Surveyor survey fetched' });
});

export const submitResponse = asyncHandler(async (req, res) => {
  const surveyId = surveyorSurveyIdSchema.parse(req.params.id);
  const payload = submitSurveyorResponseSchema.parse(req.body ?? {});
  const response = await surveyorService.submitSurveyorResponse({
    actor: req.user,
    surveyId,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { response },
    message: 'Surveyor response submitted',
  });
});
