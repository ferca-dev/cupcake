import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from '../constants/error-codes.js';
import { buildError } from '../responses/api-response.js';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();

const buildRateLimitHandler = (message) => (req, res, _next, options) =>
  res.status(options.statusCode).json(buildError(ERROR_CODES.RATE_LIMITED, message, []));

/**
 * Global API rate limiter. Tunable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX.
 * Returns the shared error envelope when the limit is exceeded.
 */
export const createGlobalRateLimiter = () =>
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: buildRateLimitHandler('Too many requests, please try again later'),
  });

/**
 * Stricter rate limiter intended for authentication endpoints. Later phases
 * will mount this on /auth routes; exposed here so the primitive lives with
 * the rest of the security middleware.
 */
export const createAuthRateLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: buildRateLimitHandler('Too many authentication attempts, please try again later'),
  });

/**
 * Rate limiter for public form submission endpoints (used in later phases).
 */
export const createPublicFormRateLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: buildRateLimitHandler('Too many submissions, please try again later'),
  });
