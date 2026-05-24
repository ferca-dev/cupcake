import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './common/utils/logger.js';
import { registerAllProcessors } from './modules/jobs/processors/index.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const start = async () => {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  try {
    await connectDatabase();
  } catch (err) {
    logger.fatal({ err }, 'Aborting startup: database connection failed');
    process.exit(1);
  }

  // Register every job processor before the HTTP listener starts. The API
  // uses the inline driver only in tests; in production the same handlers
  // are claimed and executed by the separate `pnpm run worker` process, but
  // registering them here keeps the inline-driver fallback safe and lets
  // tests run without a dedicated worker boot path.
  registerAllProcessors();

  const app = createApp();
  const server = app.listen(env.APP_PORT, () => {
    logger.info(
      { port: env.APP_PORT, env: env.APP_ENV, url: env.APP_URL },
      `${env.APP_NAME} backend listening`,
    );
  });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await disconnectDatabase();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
};

start();
