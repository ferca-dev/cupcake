import { sendSuccess } from '../../common/responses/index.js';
import { getConnectionState } from '../../config/database.js';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();

const startedAt = new Date();

/**
 * Reports application liveness and basic dependency status. Never includes
 * secrets, connection strings, or environment variable values.
 */
export const getHealth = (req, res) => {
  const databaseState = getConnectionState();
  const now = new Date();
  const uptimeSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);

  return sendSuccess(res, {
    data: {
      status: databaseState === 'connected' ? 'ok' : 'degraded',
      app: {
        name: env.APP_NAME,
        env: env.APP_ENV,
        version: process.env.npm_package_version ?? '0.0.0',
      },
      uptimeSeconds,
      dependencies: {
        database: databaseState,
      },
      timestamp: now.toISOString(),
    },
    message: 'Service is healthy',
  });
};
