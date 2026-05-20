import { HTTP_STATUS } from '../constants/http-status.js';
import { ERROR_CODES } from '../constants/error-codes.js';

/**
 * Builds a success envelope payload without sending it.
 * @param {unknown} data
 * @param {string} [message]
 */
export const buildSuccess = (data = null, message = 'Operation completed successfully') => ({
  success: true,
  data,
  message,
});

/**
 * Builds an error envelope payload without sending it.
 * @param {string} code
 * @param {string} message
 * @param {unknown[]} [details]
 */
export const buildError = (code, message, details = []) => ({
  success: false,
  error: {
    code,
    message,
    details: Array.isArray(details) ? details : [],
  },
});

/**
 * Sends a success response.
 * @param {import('express').Response} res
 * @param {object} [options]
 * @param {unknown} [options.data]
 * @param {string} [options.message]
 * @param {number} [options.statusCode]
 */
export const sendSuccess = (res, { data = null, message, statusCode = HTTP_STATUS.OK } = {}) => {
  return res.status(statusCode).json(buildSuccess(data, message));
};

/**
 * Sends an error response.
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number} options.statusCode
 * @param {string} options.code
 * @param {string} options.message
 * @param {unknown[]} [options.details]
 */
export const sendError = (
  res,
  {
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code = ERROR_CODES.INTERNAL_ERROR,
    message,
    details = [],
  },
) => {
  return res.status(statusCode).json(buildError(code, message, details));
};
