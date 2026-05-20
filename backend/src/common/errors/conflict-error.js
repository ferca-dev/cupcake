import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details = []) {
    super(message, {
      statusCode: HTTP_STATUS.CONFLICT,
      code: ERROR_CODES.CONFLICT,
      details,
    });
  }
}
