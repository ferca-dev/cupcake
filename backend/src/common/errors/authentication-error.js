import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = []) {
    super(message, {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      code: ERROR_CODES.AUTHENTICATION_ERROR,
      details,
    });
  }
}
