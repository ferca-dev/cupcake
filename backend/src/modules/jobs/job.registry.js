import { JOB_TYPE_VALUES } from './job.constants.js';

/**
 * Registry of `jobType -> handler` functions. Handlers are async callbacks
 * with the signature:
 *
 *   async (payload, context) => result
 *
 * where `context` carries the job document and a logger child bound to the
 * job. Throwing from a handler triggers retry/dead-letter handling in the
 * runner. Handlers are responsible for being idempotent — the runner does
 * not retry "exactly once", it retries at-least-once.
 */
const handlers = new Map();

export const registerJobHandler = (type, handler) => {
  if (!JOB_TYPE_VALUES.includes(type)) {
    throw new Error(`Cannot register unknown job type: ${type}`);
  }
  if (typeof handler !== 'function') {
    throw new Error(`Handler for job type ${type} must be a function`);
  }
  handlers.set(type, handler);
};

export const getJobHandler = (type) => handlers.get(type) ?? null;

export const listRegisteredJobTypes = () => [...handlers.keys()];

export const clearJobHandlers = () => {
  handlers.clear();
};
