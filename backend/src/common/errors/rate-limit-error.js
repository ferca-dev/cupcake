import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details = []) {
    super(message, {
      statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
      code: ERROR_CODES.RATE_LIMITED,
      details,
    });
  }
}
