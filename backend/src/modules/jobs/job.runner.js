import * as repo from './job.repository.js';
import { getJobHandler } from './job.registry.js';
import { logger } from '../../common/utils/logger.js';
import { loadEnv } from '../../config/env.js';

/**
 * Computes the next retry time using exponential backoff with full jitter.
 * The base delay comes from `JOB_BACKOFF_SECONDS`. We cap the doubled delay
 * at 1 hour so a job stuck in a long backoff curve still gets retried within
 * an operator's working window.
 */
export const computeNextRunAt = ({ attempts, baseSeconds }) => {
  const exp = Math.min(2 ** Math.max(0, attempts - 1), 120); // up to 120x base
  const seconds = Math.min(baseSeconds * exp, 3600);
  // Apply +/-25% jitter so synchronous retries from many tenants don't
  // hammer external providers in lockstep.
  const jitter = (Math.random() - 0.5) * 0.5 * seconds;
  return new Date(Date.now() + (seconds + jitter) * 1000);
};

/**
 * Runs the handler for a single job. The function performs the full claim →
 * execute → finalize cycle so it can be called from a polling worker loop
 * (memory driver) or directly from a synchronous `enqueueJob` call (inline
 * driver). Returning the resolved job document is convenient for tests.
 *
 * Errors are caught here: any throw from a handler triggers retry/dead-letter
 * handling. The function itself never throws so the surrounding worker loop
 * stays alive even when a processor misbehaves.
 */
export const runJobOnce = async ({ workerId, env = loadEnv(), runner = null } = {}) => {
  const lockTimeoutMs = env.JOB_LOCK_TIMEOUT_MS;
  const claimed = await repo.claimNextJob({
    workerId,
    lockTimeoutMs,
  });
  if (!claimed) return null;

  const log = logger.child({ jobId: claimed._id.toString(), jobType: claimed.type });
  const handler = runner ?? getJobHandler(claimed.type);
  if (!handler) {
    log.error('No handler registered for job type — dead-lettering');
    return repo.markJobDeadLetter({
      jobId: claimed._id,
      error: { message: `No handler registered for job type ${claimed.type}` },
    });
  }

  try {
    const result = await handler(claimed.payload ?? {}, {
      job: claimed,
      logger: log,
      tenantId: claimed.tenantId?.toString() ?? null,
    });
    log.info({ result: typeof result }, 'Job completed');
    return await repo.markJobCompleted({ jobId: claimed._id, result: result ?? null });
  } catch (err) {
    const attempts = claimed.attempts;
    const maxAttempts = claimed.maxAttempts;
    if (attempts >= maxAttempts) {
      log.error({ err, attempts, maxAttempts }, 'Job exhausted retries — dead-lettering');
      return repo.markJobDeadLetter({ jobId: claimed._id, error: err });
    }
    const nextRunAt = computeNextRunAt({
      attempts,
      baseSeconds: env.JOB_BACKOFF_SECONDS,
    });
    log.warn({ err, attempts, maxAttempts, nextRunAt }, 'Job failed — scheduling retry');
    return repo.markJobFailedForRetry({
      jobId: claimed._id,
      error: err,
      nextRunAt,
    });
  }
};
