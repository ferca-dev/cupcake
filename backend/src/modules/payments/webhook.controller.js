import * as paymentService from './payment.service.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Mercado Pago webhook receiver. We always reply 200 (with a friendly body)
 * unless the request itself is malformed or its signature is invalid — that
 * keeps Mercado Pago from entering exponential backoff for events we've
 * already accepted and stored.
 *
 * The actual processing happens in `payment.service.js#processIncomingWebhook`,
 * which is idempotent: deliveries with the same provider event id collapse
 * into one stored row and never double-credit tokens.
 */
export const receiveMercadoPagoWebhook = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  // We do not have access to the raw bytes here unless `express.raw` is mounted
  // on this route. We re-stringify the parsed body so signature verification
  // can run against deterministic input until raw-body support is added.
  const rawBody = JSON.stringify(body);
  const result = await paymentService.processIncomingWebhook({
    body,
    rawBody,
    headers: req.headers ?? {},
  });

  if (result.status === 'rejected') {
    logger.warn({ reason: result.reason }, 'Mercado Pago webhook rejected');
    return res
      .status(401)
      .json({ success: false, error: { code: 'WEBHOOK_REJECTED', message: result.reason } });
  }

  return sendSuccess(res, {
    data: {
      status: result.status,
      eventId: result.event?._id?.toString() ?? null,
      reason: result.reason ?? null,
    },
    message: 'Mercado Pago webhook acknowledged',
  });
});
