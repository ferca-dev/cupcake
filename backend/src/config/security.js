import helmet from 'helmet';
import cors from 'cors';
import { AuthorizationError } from '../common/errors/index.js';
import { loadEnv } from './env.js';

const env = loadEnv();

const isAllowedVercelPreviewOrigin = (origin) => {
  try {
    const requestUrl = new URL(origin);
    const frontendUrl = new URL(env.FRONTEND_URL);
    if (requestUrl.protocol !== 'https:' || frontendUrl.hostname.endsWith('.vercel.app') === false) {
      return false;
    }

    const projectName = frontendUrl.hostname.replace(/\.vercel\.app$/, '');
    return (
      requestUrl.hostname.endsWith('.vercel.app') &&
      requestUrl.hostname.startsWith(`${projectName}-`)
    );
  } catch {
    return false;
  }
};

/**
 * Helmet configuration. Defaults are conservative; tweaks here keep API
 * responses portable while still hardening common headers.
 */
export const createHelmetMiddleware = () =>
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  });

/**
 * CORS configuration driven by CORS_ORIGIN. Supports a comma-separated list
 * of origins so additional environments can be added without code changes.
 * Requests with no Origin header (e.g. server-to-server, curl, health checks)
 * are allowed; browser-origin requests are matched against the allow list.
 */
export const createCorsMiddleware = () => {
  const allowList = env.corsOrigins;
  return cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowList.includes('*') || allowList.includes(origin) || isAllowedVercelPreviewOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new AuthorizationError(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
};
