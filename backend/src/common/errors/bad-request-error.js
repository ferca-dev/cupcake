import { AppError } from './app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = []) {
    super(message, {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      code: ERROR_CODES.BAD_REQUEST,
      details,
    });
  }
}
