/**
 * Wraps an async route handler so that any rejected promise is forwarded to
 * Express's error pipeline. Allows handlers to use plain async/await without
 * try/catch boilerplate.
 *
 * @template {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => unknown} Handler
 * @param {Handler} handler
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
