import fs from 'node:fs/promises';
import path from 'node:path';

import { sendSuccess } from '../../common/responses/index.js';
import { sendError } from '../../common/responses/api-response.js';
import { ERROR_CODES, HTTP_STATUS } from '../../common/constants/index.js';
import { getConnectionState, mongoose } from '../../config/database.js';
import { loadEnv } from '../../config/env.js';
import * as jobService from '../jobs/job.service.js';

const env = loadEnv();

const startedAt = new Date();

const withTimeout = async (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);

const checkDatabase = async () => {
  const state = getConnectionState();
  if (state !== 'connected') {
    return { status: 'down', state, critical: true, message: 'MongoDB is not connected' };
  }
  try {
    await withTimeout(mongoose.connection.db.admin().ping(), 2000, 'MongoDB ping');
    return { status: 'ok', state, critical: true };
  } catch (err) {
    return {
      status: 'down',
      state,
      critical: true,
      message: err?.message ?? 'MongoDB ping failed',
    };
  }
};

const checkStorage = async () => {
  if (env.STORAGE_DRIVER === 'local') {
    try {
      await fs.access(path.resolve(env.LOCAL_UPLOADS_DIR));
      return { status: 'ok', driver: 'local', critical: true };
    } catch (err) {
      return {
        status: 'down',
        driver: 'local',
        critical: true,
        message: err?.code === 'ENOENT' ? 'Local uploads directory does not exist' : err.message,
      };
    }
  }

  if (env.STORAGE_DRIVER === 's3') {
    try {
      const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      });
      await withTimeout(client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET })), 3000, 'S3');
      return { status: 'ok', driver: 's3', bucket: env.S3_BUCKET, critical: true };
    } catch (err) {
      return {
        status: 'down',
        driver: 's3',
        bucket: env.S3_BUCKET,
        critical: true,
        message: err?.name ?? err?.message ?? 'S3 bucket check failed',
      };
    }
  }

  return { status: 'unknown', driver: env.STORAGE_DRIVER, critical: true };
};

export const collectDependencyStatus = async () => {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const jobs =
    database.status !== 'ok'
      ? { status: 'unknown', critical: false, message: 'Skipped because MongoDB is unavailable' }
      : await jobService
          .getStatusCounts()
          .then((counts) => ({ status: 'ok', critical: false, counts }))
          .catch((err) => ({
            status: 'down',
            critical: false,
            message: err?.message ?? 'Job queue stats unavailable',
          }));
  const dependencies = { database, storage, jobs };
  const ready = Object.values(dependencies).every(
    (dependency) => !dependency.critical || dependency.status === 'ok',
  );
  return { ready, dependencies };
};

const appMetadata = () => ({
  name: env.APP_NAME,
  env: env.APP_ENV,
  version: process.env.npm_package_version ?? '0.0.0',
});

const uptimeSeconds = () => Math.floor((Date.now() - startedAt.getTime()) / 1000);

/**
 * Reports application liveness and basic dependency status. Never includes
 * secrets, connection strings, or environment variable values.
 */
export const getHealth = (req, res) => {
  const databaseState = getConnectionState();
  const now = new Date();

  return sendSuccess(res, {
    data: {
      status: databaseState === 'connected' ? 'ok' : 'degraded',
      app: appMetadata(),
      uptimeSeconds: uptimeSeconds(),
      dependencies: {
        database: databaseState,
      },
      timestamp: now.toISOString(),
    },
    message: 'Service is healthy',
  });
};

export const getLiveness = (_req, res) =>
  sendSuccess(res, {
    data: {
      status: 'ok',
      app: appMetadata(),
      uptimeSeconds: uptimeSeconds(),
      timestamp: new Date().toISOString(),
    },
    message: 'Service is live',
  });

export const getReadiness = async (_req, res) => {
  const status = await collectDependencyStatus();
  const data = {
    status: status.ready ? 'ready' : 'not_ready',
    app: appMetadata(),
    uptimeSeconds: uptimeSeconds(),
    dependencies: status.dependencies,
    timestamp: new Date().toISOString(),
  };
  if (!status.ready) {
    return sendError(res, {
      statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Service is not ready',
      details: [data],
    });
  }
  return sendSuccess(res, { data, message: 'Service is ready' });
};

export const getDependencies = async (_req, res) => {
  const status = await collectDependencyStatus();
  const data = {
    status: status.ready ? 'ok' : 'degraded',
    dependencies: status.dependencies,
    timestamp: new Date().toISOString(),
  };
  return sendSuccess(res, { data, message: 'Dependency status fetched' });
};
