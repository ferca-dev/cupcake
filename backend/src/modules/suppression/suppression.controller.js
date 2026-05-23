import * as suppressionService from './suppression.service.js';
import {
  createSuppressionSchema,
  listSuppressionQuerySchema,
  publicEmailUnsubscribeTokenSchema,
  twilioOptOutSchema,
} from './suppression.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

export const listSuppressionEntries = asyncHandler(async (req, res) => {
  const query = listSuppressionQuerySchema.parse(req.query ?? {});
  const tenantId = resolveTenantId(req);
  const result = await suppressionService.listSuppressionEntries({ tenantId, ...query });
  return sendSuccess(res, { data: result, message: 'Suppression entries fetched' });
});

export const createSuppressionEntry = asyncHandler(async (req, res) => {
  const payload = createSuppressionSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const suppression = await suppressionService.createSuppressionEntry({
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { suppression },
    message: 'Suppression entry created',
  });
});

export const releaseSuppressionEntry = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const suppression = await suppressionService.releaseSuppressionEntry({
    id: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    data: { suppression },
    message: 'Suppression entry released',
  });
});

export const previewEmailUnsubscribe = asyncHandler(async (req, res) => {
  const token = publicEmailUnsubscribeTokenSchema.shape.token.parse(req.params.token);
  const result = await suppressionService.previewEmailUnsubscribe({ token });
  return sendSuccess(res, { data: result, message: 'Unsubscribe token verified' });
});

export const processEmailUnsubscribe = asyncHandler(async (req, res) => {
  const payload = publicEmailUnsubscribeTokenSchema.parse(req.body ?? {});
  const result = await suppressionService.processEmailUnsubscribe({
    token: payload.token,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Email unsubscribed' });
});

export const receiveTwilioOptOut = asyncHandler(async (req, res) => {
  const payload = twilioOptOutSchema.parse(req.body ?? {});
  const result = await suppressionService.recordTwilioOptOutEvent({
    from: payload.From ?? null,
    to: payload.To ?? null,
    body: payload.Body ?? null,
    messageSid: payload.MessageSid ?? payload.SmsSid ?? null,
    tenantId: payload.TenantId ?? payload.tenantId ?? null,
    channel: payload.Channel ?? payload.channel ?? null,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    data: result,
    message: 'Twilio opt-out event acknowledged',
  });
});
