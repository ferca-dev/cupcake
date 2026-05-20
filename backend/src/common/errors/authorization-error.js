import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action', details = []) {
    super(message, {
      statusCode: HTTP_STATUS.FORBIDDEN,
      code: ERROR_CODES.AUTHORIZATION_ERROR,
      details,
    });
  }
}
