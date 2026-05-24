import { loadEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './common/utils/logger.js';
import { registerAllProcessors } from './modules/jobs/processors/index.js';
import { assertHandlersRegistered } from './modules/jobs/job.service.js';
import { createJobWorker } from './modules/jobs/job.worker.js';
import { createJobScheduler } from './modules/jobs/job.scheduler.js';

/**
 * Standalone worker process. Run with
 *   pnpm --filter @cupcake/backend run worker
 * (or `node --env-file=.env src/worker.js`) alongside the API process. The
 * worker:
 *   - boots the same env validation and database connection as the API,
 *   - registers every job processor,
 *   - enqueues the scheduled jobs once at start and re-checks them on a
 *     timer so recurring reminders fire even when no HTTP traffic arrives,
 *   - starts `JOB_CONCURRENCY` polling loops that claim and execute jobs.
 *
 * The API process can run jobs inline (in tests) or hand them to this
 * worker (in production); the runtime behaviour is identical because both
 * paths share the `runJobOnce` implementation.
 */
const SHUTDOWN_TIMEOUT_MS = 30_000;

const start = async () => {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (env.JOB_QUEUE_DRIVER === 'inline') {
    logger.error(
      'Refusing to start worker with JOB_QUEUE_DRIVER=inline — inline mode runs jobs inside the producing process. Set JOB_QUEUE_DRIVER=memory before launching the worker.',
    );
    process.exit(1);
  }

  try {
    await connectDatabase();
  } catch (err) {
    logger.fatal({ err }, 'Aborting worker startup: database connection failed');
    process.exit(1);
  }

  registerAllProcessors();
  assertHandlersRegistered();

  const scheduler = createJobScheduler({ env });
  const worker = createJobWorker({ env });

  await scheduler.start();
  worker.start();
  logger.info(
    {
      driver: env.JOB_QUEUE_DRIVER,
      concurrency: env.JOB_CONCURRENCY,
      maxAttempts: env.JOB_MAX_ATTEMPTS,
    },
    `${env.APP_NAME} job worker ready`,
  );

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Worker graceful shutdown initiated');

    const forceExit = setTimeout(() => {
      logger.error('Worker forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      scheduler.stop();
      await worker.stop();
      await disconnectDatabase();
      logger.info('Worker graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Worker unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Worker uncaught exception');
    shutdown('uncaughtException');
  });
};

start();
