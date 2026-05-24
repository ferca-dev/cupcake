import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HTTP_STATUS } from '../constants/http-status.js';
import { sendError } from '../responses/api-response.js';
import { logger } from '../utils/logger.js';
import { loadEnv } from '../../config/env.js';
import { captureException } from '../../modules/observability/error-monitoring.js';

const resolveEnv = () => {
  try {
    return loadEnv();
  } catch {
    return {
      isProduction: process.env.APP_ENV === 'production',
    };
  }
};

const normalize = (err) => {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Invalid payload',
      details: err.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      })),
    };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Invalid payload',
      details: Object.values(err.errors).map((mongooseErr) => ({
        path: mongooseErr.path ? [mongooseErr.path] : [],
        message: mongooseErr.message,
        kind: mongooseErr.kind,
      })),
    };
  }

  if (err instanceof mongoose.Error.CastError) {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      code: ERROR_CODES.BAD_REQUEST,
      message: `Invalid value for ${err.path}`,
      details: [],
    };
  }

  if (err?.code === 11000) {
    return {
      statusCode: HTTP_STATUS.CONFLICT,
      code: ERROR_CODES.CONFLICT,
      message: 'Resource already exists',
      details: err.keyValue ? [{ keys: Object.keys(err.keyValue) }] : [],
    };
  }

  if (err?.type === 'entity.too.large') {
    return {
      statusCode: HTTP_STATUS.PAYLOAD_TOO_LARGE,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      message: 'Request payload is too large',
      details: [],
    };
  }

  if (err?.type === 'entity.parse.failed') {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      code: ERROR_CODES.BAD_REQUEST,
      message: 'Malformed JSON payload',
      details: [],
    };
  }

  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return {
      statusCode: err.statusCode,
      code: err.code || ERROR_CODES.BAD_REQUEST,
      message: err.message || 'Bad request',
      details: [],
    };
  }

  return {
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
    details: [],
  };
};

/**
 * Global error handler. Translates application, Zod, and Mongoose errors into
 * the shared error envelope. Stack traces are never sent in production.
 */
export const errorHandler = (err, req, res, _next) => {
  const env = resolveEnv();
  const normalized = normalize(err);
  const log = req.log ?? logger;

  const logPayload = {
    err,
    statusCode: normalized.statusCode,
    code: normalized.code,
  };

  if (normalized.statusCode >= 500) {
    log.error(logPayload, normalized.message);
    captureException(err, {
      req,
      tags: { handled: 'global_error_handler', module: 'http' },
      extra: { statusCode: normalized.statusCode, code: normalized.code },
    });
  } else {
    log.warn(logPayload, normalized.message);
  }

  const responseBody = {
    statusCode: normalized.statusCode,
    code: normalized.code,
    message: normalized.message,
    details: normalized.details,
  };

  if (!env.isProduction && err instanceof Error && err.stack) {
    responseBody.details = [...responseBody.details, { stack: err.stack.split('\n') }];
  }

  return sendError(res, responseBody);
};
