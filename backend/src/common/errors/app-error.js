import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';

/**
 * Base application error. All operational errors thrown by the application
 * should extend this class so the global error handler can produce a safe,
 * consistent error envelope without leaking implementation details.
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable message safe to expose to clients.
   * @param {object} [options]
   * @param {number} [options.statusCode]
   * @param {string} [options.code]
   * @param {unknown[]} [options.details]
   * @param {Error} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR;
    this.code = options.code ?? ERROR_CODES.INTERNAL_ERROR;
    this.details = Array.isArray(options.details) ? options.details : [];
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
