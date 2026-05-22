import { Router } from 'express';
import express from 'express';

import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { recordSendGridEvent, recordTwilioStatusEvent } from './webhook.service.js';

export const webhooksRouter = Router();

/**
 * Twilio posts message status events as `application/x-www-form-urlencoded`.
 * The body parser at the app level already handles URL-encoded payloads, but
 * we mount an explicit parser here in case the body limit is changed in the
 * future. Signature verification can be enabled by validating the
 * `X-Twilio-Signature` header against the request URL + body using the
 * `TWILIO_AUTH_TOKEN`; left commented out until a webhook host is finalised.
 */
webhooksRouter.post(
  '/twilio/messages',
  express.urlencoded({ extended: true }),
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    await recordTwilioStatusEvent({
      messageSid: body.MessageSid ?? body.SmsSid ?? null,
      messageStatus: body.MessageStatus ?? body.SmsStatus ?? null,
      errorCode: body.ErrorCode ?? null,
    });
    // Twilio expects a 200/204 — anything else triggers retries. We never echo
    // back the payload so accidental leaks of message bodies stay impossible.
    return sendSuccess(res, { data: null, message: 'Twilio status event acknowledged' });
  }),
);

/**
 * SendGrid posts events as a JSON array. Each event references the original
 * message via `sg_message_id` and via the `submissionToken` custom arg we set
 * when sending. Signature verification (X-Twilio-Email-Event-Webhook-*) is
 * documented in the README but left optional here so a project can wire it up
 * once the public webhook URL is reserved.
 */
webhooksRouter.post(
  '/sendgrid/events',
  asyncHandler(async (req, res) => {
    const events = Array.isArray(req.body) ? req.body : [];
    for (const event of events) {
      await recordSendGridEvent(event);
    }
    return sendSuccess(res, { data: { processed: events.length }, message: 'SendGrid events processed' });
  }),
);
