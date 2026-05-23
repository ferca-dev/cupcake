import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

/**
 * Returned when the tenant's plan does not include the requested feature.
 *
 * The HTTP status is 402 (Payment Required) so clients can branch on the
 * upgrade flow without parsing the error code. `details[0]` always contains
 * `{ feature, planCode }` so the UI can show a precise upgrade prompt.
 */
export class FeatureBlockedError extends AppError {
  constructor(message, { feature, planCode = null, planName = null } = {}) {
    super(message, {
      statusCode: HTTP_STATUS.PAYMENT_REQUIRED ?? 402,
      code: ERROR_CODES.FEATURE_BLOCKED,
      details: [
        {
          feature,
          planCode,
          planName,
        },
      ],
    });
    this.feature = feature;
    this.planCode = planCode;
  }
}
