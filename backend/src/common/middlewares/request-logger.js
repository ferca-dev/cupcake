import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.js';

/**
 * HTTP request logger middleware backed by pino-http. Each request is assigned
 * a `requestId` and logged with a sanitized request/response summary. Secrets,
 * cookies, and tokens are redacted by the underlying logger configuration.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  customProps: (req) => ({ requestId: req.id }),
});
