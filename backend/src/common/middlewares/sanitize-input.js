const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/**
 * Recursively removes keys that start with `$` (MongoDB operators) or are
 * known prototype-pollution vectors. Mutates plain objects in place; arrays
 * are traversed but kept intact. Primitive values pass through unchanged.
 */
const sanitize = (value) => {
  if (Array.isArray(value)) {
    for (const item of value) sanitize(item);
    return value;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || PROTOTYPE_KEYS.has(key)) {
        delete value[key];
        continue;
      }
      sanitize(value[key]);
    }
  }
  return value;
};

/**
 * Express middleware that strips MongoDB operators and prototype-pollution
 * keys from request bodies, query strings, and route params. Replaces the
 * unmaintained `express-mongo-sanitize` package while staying compatible
 * with Express 5's read-only `req.query`.
 */
export const sanitizeInput = (req, _res, next) => {
  if (req.body) sanitize(req.body);
  if (req.params) sanitize(req.params);
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (key.startsWith('$') || PROTOTYPE_KEYS.has(key)) {
        delete req.query[key];
        continue;
      }
      sanitize(req.query[key]);
    }
  }
  next();
};
