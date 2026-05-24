import { logger } from '../../common/utils/logger.js';
import { loadEnv } from '../../config/env.js';
import { recordOperationalEvent } from './metrics.service.js';

const safeRequestContext = (req) => {
  if (!req) return null;
  return {
    requestId: req.id ?? null,
    correlationId: req.correlationId ?? req.id ?? null,
    method: req.method,
    path: req.originalUrl?.split('?')[0] ?? req.url?.split('?')[0] ?? null,
    ip: req.ip,
  };
};

export const captureException = (err, { req = null, tags = {}, extra = {} } = {}) => {
  let env;
  try {
    env = loadEnv();
  } catch {
    env = {
      ERROR_MONITORING_DSN: '',
      ERROR_MONITORING_ENVIRONMENT: '',
      APP_ENV: process.env.APP_ENV,
    };
  }
  recordOperationalEvent('error_monitoring_events_total', {
    handled: tags.handled ?? 'unknown',
    module: tags.module ?? 'global',
  });

  if (!env.ERROR_MONITORING_DSN) {
    logger.debug(
      {
        err,
        tags,
        extra,
        request: safeRequestContext(req),
      },
      'Error monitoring capture skipped; ERROR_MONITORING_DSN is not configured',
    );
    return { captured: false, provider: 'none' };
  }

  // Provider-neutral hook. A future SDK adapter should enqueue from here so
  // request latency is not tied to the monitoring vendor.
  logger.error(
    {
      err,
      tags,
      extra,
      request: safeRequestContext(req),
      monitoringEnvironment: env.ERROR_MONITORING_ENVIRONMENT || env.APP_ENV,
    },
    'Error captured for external monitoring',
  );
  return { captured: true, provider: 'generic' };
};
