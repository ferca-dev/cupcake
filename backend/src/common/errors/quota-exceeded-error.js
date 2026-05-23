import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

/**
 * Returned when a tenant tries to perform an action that would exceed their
 * plan quota. The HTTP status is 402 (Payment Required) so the UI can branch
 * on the upgrade flow without parsing the error code.
 *
 * `details[0]` carries the machine-readable upgrade context so the frontend
 * can build a precise prompt without re-computing the limit.
 */
export class QuotaExceededError extends AppError {
  constructor(message, { quota, limit, usage, requested = 1, planCode = null, planName = null }) {
    super(message, {
      statusCode: HTTP_STATUS.PAYMENT_REQUIRED ?? 402,
      code: ERROR_CODES.QUOTA_EXCEEDED,
      details: [
        {
          quota,
          limit,
          usage,
          requested,
          planCode,
          planName,
        },
      ],
    });
    this.quota = quota;
    this.limit = limit;
    this.usage = usage;
    this.planCode = planCode;
  }
}
