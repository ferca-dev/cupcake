import { NotFoundError } from '../errors/index.js';

/**
 * Catch-all for unmatched routes. Forwards a NotFoundError to the global
 * error handler so the response shape stays consistent.
 */
export const notFoundHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} was not found`));
};
