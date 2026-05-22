import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

/**
 * Thrown when a public-form submission would violate a survey's
 * `responseLimit` rule (one-per-contact, one-per-device, one-per-ip). The
 * status code matches `ConflictError` so existing public clients that already
 * handle 409 do not need a new code path; the dedicated `code` lets new
 * clients surface a tailored message.
 */
export class ResponseLimitError extends AppError {
  constructor(message = 'This survey has already been answered.', details = []) {
    super(message, {
      statusCode: HTTP_STATUS.CONFLICT,
      code: ERROR_CODES.RESPONSE_LIMIT_REACHED,
      details,
    });
  }
}
