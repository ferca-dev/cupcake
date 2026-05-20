import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = []) {
    super(message, {
      statusCode: HTTP_STATUS.NOT_FOUND,
      code: ERROR_CODES.NOT_FOUND,
      details,
    });
  }
}
