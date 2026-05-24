import os from 'node:os';

import { runJobOnce } from './job.runner.js';
import { logger } from '../../common/utils/logger.js';
import { loadEnv } from '../../config/env.js';

/**
 * Long-running polling worker. The worker runs N concurrent claim loops
 * sized by `JOB_CONCURRENCY`. Each loop:
 *   1. Tries to claim and execute a job.
 *   2. If nothing was claimed, sleeps for `JOB_POLL_INTERVAL_MS` and retries.
 *   3. Re-runs in a tight loop while jobs are available so a backlog drains
 *      quickly without waiting for the next tick.
 *
 * Calling `stop()` flips a shared flag and resolves once every loop has
 * exited, giving the host process a clean shutdown signal.
 */
export const createJobWorker = ({
  env = loadEnv(),
  workerId = `${os.hostname()}#${process.pid}`,
} = {}) => {
  let running = false;
  const loopPromises = [];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const loop = async (slot) => {
    const log = logger.child({ workerSlot: `${workerId}/${slot}` });
    while (running) {
      try {
        const job = await runJobOnce({ workerId, env });
        if (!job) {
          // Idle — wait before polling again so we don't hammer Mongo.
          await sleep(env.JOB_POLL_INTERVAL_MS);
        }
      } catch (err) {
        // runJobOnce already handles handler failures; reaching here means a
        // database or driver-level error. Back off briefly so transient
        // outages don't burn CPU on retries.
        log.error({ err }, 'Worker loop encountered an unexpected error');
        await sleep(env.JOB_POLL_INTERVAL_MS * 4);
      }
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      for (let i = 0; i < env.JOB_CONCURRENCY; i += 1) {
        loopPromises.push(loop(i));
      }
      logger.info(
        { workerId, concurrency: env.JOB_CONCURRENCY, driver: env.JOB_QUEUE_DRIVER },
        'Job worker started',
      );
    },
    async stop() {
      if (!running) return;
      running = false;
      await Promise.allSettled(loopPromises);
      loopPromises.length = 0;
      logger.info({ workerId }, 'Job worker stopped');
    },
  };
};
