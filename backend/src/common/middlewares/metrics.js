import { recordHttpRequest } from '../../modules/observability/metrics.service.js';

const normalizePath = (path) =>
  String(path ?? '')
    .split('?')[0]
    .replace(/[a-f\d]{24}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:number')
    .slice(0, 200);

export const metricsMiddleware = (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    recordHttpRequest({
      method: req.method,
      route: normalizePath(req.originalUrl || req.url),
      statusCode: res.statusCode,
      durationMs,
    });
  });
  next();
};
