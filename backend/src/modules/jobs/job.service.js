import { disabledFeatureError } from '../../common/middlewares/surveys-only.js';
import * as repo from './job.repository.js';
import { getJobHandler } from './job.registry.js';
import { JOB_STATUSES, JOB_TYPE_VALUES } from './job.constants.js';
import { logger } from '../../common/utils/logger.js';
import { loadEnv } from '../../config/env.js';
import { ValidationError, NotFoundError } from '../../common/errors/index.js';
import { computeNextRunAt } from './job.runner.js';

const assertKnownType = (type) => {
  if (!JOB_TYPE_VALUES.includes(type)) {
    throw new ValidationError(`Unknown job type: ${type}`);
  }
};

/**
 * Returns the queue driver currently in effect. Loaded through a getter so
 * tests that mutate JOB_QUEUE_DRIVER and call `resetEnvCache()` see the new
 * value on their next enqueue.
 */
export const resolveDriverName = () => loadEnv().JOB_QUEUE_DRIVER;

/**
 * Enqueues a job. The function returns the persisted document so the caller
 * can hand back a job id to the client.
 *
 * The semantics differ slightly per driver:
 *   - `memory`: writes a `queued` document; an external worker (started via
 *     `pnpm run worker`) picks it up.
 *   - `inline`: writes a `queued` document and immediately runs the handler
 *     in-process. Used by the test suite so HTTP responses can observe job
 *     side-effects without spinning up a worker.
 *   - `redis`: not implemented — env validation refuses to boot.
 *
 * `dedupeKey` collapses repeated enqueues. When a duplicate is detected the
 * existing document is returned untouched and the handler is NOT re-run,
 * which is exactly what we want for idempotent producers (e.g. retrying a
 * Mercado Pago webhook).
 */
export const enqueueJob = async ({
  type,
  payload = {},
  tenantId = null,
  dedupeKey = null,
  delaySeconds = 0,
  maxAttempts = null,
  enqueuedBy = null,
  priority = 0,
  recurrence = null,
  runner = null,
}) => {
  assertKnownType(type);
  const env = loadEnv();
  if (env.SURVEYS_ONLY && /^(campaign\.|payment\.|webhook\.)/.test(type))
    throw disabledFeatureError();
  const job = await repo.insertJob({
    type,
    payload,
    tenantId,
    dedupeKey,
    enqueuedBy,
    priority,
    recurrence,
    maxAttempts: maxAttempts ?? env.JOB_MAX_ATTEMPTS,
    availableAt: delaySeconds > 0 ? new Date(Date.now() + delaySeconds * 1000) : new Date(),
  });

  // Inline driver runs the work synchronously and propagates the original
  // error out of the enqueue call. This keeps existing HTTP handlers — and
  // therefore the test suite — able to translate domain errors (Conflict,
  // NotFound, etc.) into the right HTTP status. The job document is still
  // updated with the terminal state so admin tooling can inspect what
  // happened, just like the polling driver would.
  if (resolveDriverName() === 'inline' && job.status === JOB_STATUSES.QUEUED) {
    return runJobInline({ job, env, runner });
  }

  return job;
};

const runJobInline = async ({ job, env, runner }) => {
  const handler = runner ?? getJobHandler(job.type);
  if (!handler) {
    const error = new Error(`No handler registered for job type ${job.type}`);
    await repo.markJobDeadLetter({ jobId: job._id, error });
    throw error;
  }

  // Reuse the same claim-style transition so the document path mirrors the
  // memory driver. We bypass `claimNextJob` because we already know which
  // job to run; setting attempts/lockedAt directly keeps the inline path
  // O(1) instead of paying for an extra round-trip.
  const now = new Date();
  job.status = JOB_STATUSES.RUNNING;
  job.attempts = (job.attempts ?? 0) + 1;
  job.lockedAt = now;
  job.lockedBy = 'inline';
  job.startedAt = now;
  await job.save();

  try {
    const result = await handler(job.payload ?? {}, {
      job,
      logger: logger.child({ jobId: job._id.toString(), jobType: job.type }),
      tenantId: job.tenantId?.toString() ?? null,
    });
    return repo.markJobCompleted({ jobId: job._id, result: result ?? null });
  } catch (err) {
    if (job.attempts >= job.maxAttempts) {
      await repo.markJobDeadLetter({ jobId: job._id, error: err });
    } else {
      await repo.markJobFailedForRetry({
        jobId: job._id,
        error: err,
        nextRunAt: computeNextRunAt({
          attempts: job.attempts,
          baseSeconds: env.JOB_BACKOFF_SECONDS,
        }),
      });
    }
    // Re-throw so the request handler sees the original domain error and
    // the global error middleware can map it to the correct HTTP status.
    throw err;
  }
};

export const getJob = async (id) => {
  const job = await repo.findJobById(id);
  if (!job) throw new NotFoundError('Job not found');
  return job;
};

export const listJobs = async (query = {}) => repo.listJobs(query);

export const getStatusCounts = async (filter = {}) => repo.aggregateStatusCounts(filter);

/**
 * Reset a job back to `queued` so the runner picks it up again. Used by the
 * admin "Retry" button and to resurrect dead-letter jobs after an incident.
 */
export const retryJob = async (id) => {
  const job = await repo.findJobById(id);
  if (!job) throw new NotFoundError('Job not found');
  if (![JOB_STATUSES.FAILED, JOB_STATUSES.DEAD_LETTER].includes(job.status)) {
    throw new ValidationError(
      `Only failed or dead-letter jobs can be retried (status=${job.status})`,
    );
  }
  // Bumping `maxAttempts` keeps the retry budget honest: an operator who
  // explicitly requeues a job expects at least one more attempt regardless
  // of how many were burned before.
  if (job.attempts >= job.maxAttempts) {
    job.maxAttempts = job.attempts + 1;
    await job.save();
  }
  return repo.requeueJob({ jobId: job._id });
};

/**
 * Verifies that every registered job type has a handler. Used by the worker
 * boot path so a missing wire-up surfaces immediately rather than failing on
 * the first invocation.
 */
export const assertHandlersRegistered = () => {
  const missing = JOB_TYPE_VALUES.filter((type) => !getJobHandler(type));
  if (missing.length > 0) {
    logger.warn({ missing }, 'Job types with no registered handler');
  }
};
