import mongoose from 'mongoose';

import { Job } from './job.model.js';
import { JOB_STATUSES } from './job.constants.js';

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
};

const sanitizeError = (err) => {
  if (!err) return null;
  if (typeof err === 'string') return { message: err.slice(0, 500) };
  const message = typeof err.message === 'string' ? err.message.slice(0, 500) : null;
  const name = typeof err.name === 'string' ? err.name.slice(0, 120) : null;
  // Stack traces can be long; keep the tail so the most relevant frames stay
  // visible while we cap storage to a sane size.
  const stack = typeof err.stack === 'string' ? err.stack.slice(0, 2000) : null;
  return { message, name, stack, occurredAt: new Date() };
};

/**
 * Inserts a job document. If a `dedupeKey` is provided and a duplicate-key
 * error fires, returns the existing job rather than throwing — the caller
 * can treat the second enqueue as a no-op without inspecting Mongo errors.
 */
export const insertJob = async (data) => {
  try {
    return await Job.create({
      tenantId: toObjectId(data.tenantId),
      type: data.type,
      status: data.status ?? JOB_STATUSES.QUEUED,
      payload: data.payload ?? {},
      attempts: 0,
      maxAttempts: data.maxAttempts,
      availableAt: data.availableAt ?? new Date(),
      dedupeKey: data.dedupeKey ?? null,
      recurrence: data.recurrence ?? null,
      enqueuedBy: toObjectId(data.enqueuedBy),
      priority: data.priority ?? 0,
    });
  } catch (err) {
    if (err?.code === 11000 && data.dedupeKey) {
      const existing = await Job.findOne({
        dedupeKey: data.dedupeKey,
        status: mongoose.trusted({
          $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING, JOB_STATUSES.FAILED],
        }),
      });
      if (existing) return existing;
    }
    throw err;
  }
};

/**
 * Atomically claims the next eligible job. Returns the locked document or
 * `null` if nothing is ready. We rely on `findOneAndUpdate` with a precise
 * filter on `lockedAt` so two workers polling at the same instant cannot
 * both observe the same job as available.
 */
export const claimNextJob = async ({ workerId, lockTimeoutMs, now = new Date() }) => {
  const staleLockBefore = new Date(now.getTime() - lockTimeoutMs);
  // mongoose.trusted() opts the comparison object out of strict-mode query
  // sanitisation. Without it, Mongoose 8 sees `{ $lte: now }` and tries to
  // cast the whole object as a Date which throws CastError.
  const filter = {
    status: mongoose.trusted({ $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING] }),
    availableAt: mongoose.trusted({ $lte: now }),
    $or: [
      { lockedAt: null },
      { lockedAt: mongoose.trusted({ $lte: staleLockBefore }) },
    ],
  };
  const update = {
    $set: {
      status: JOB_STATUSES.RUNNING,
      lockedAt: now,
      lockedBy: workerId,
      startedAt: now,
    },
    $inc: { attempts: 1 },
  };
  return Job.findOneAndUpdate(filter, update, {
    new: true,
    sort: { priority: -1, availableAt: 1 },
  });
};

export const findJobById = async (id) => {
  if (!toObjectId(id)) return null;
  return Job.findById(id);
};

export const findJobByDedupeKey = async (dedupeKey) => {
  if (!dedupeKey) return null;
  return Job.findOne({ dedupeKey });
};

export const markJobCompleted = async ({ jobId, result = null, now = new Date() }) =>
  Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUSES.COMPLETED,
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
        result,
        error: null,
      },
    },
    { new: true },
  );

export const markJobFailedForRetry = async ({ jobId, error, nextRunAt, now = new Date() }) =>
  Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUSES.FAILED,
        failedAt: now,
        lockedAt: null,
        lockedBy: null,
        availableAt: nextRunAt,
        error: sanitizeError(error),
      },
    },
    { new: true },
  );

export const markJobDeadLetter = async ({ jobId, error, now = new Date() }) =>
  Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUSES.DEAD_LETTER,
        deadLetteredAt: now,
        lockedAt: null,
        lockedBy: null,
        error: sanitizeError(error),
      },
    },
    { new: true },
  );

/**
 * Resets a dead-letter or failed job so it becomes eligible again. Used by
 * the admin "retry" endpoint and the inline driver for tests.
 */
export const requeueJob = async ({ jobId, now = new Date() }) =>
  Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUSES.QUEUED,
        availableAt: now,
        lockedAt: null,
        lockedBy: null,
        failedAt: null,
        deadLetteredAt: null,
      },
    },
    { new: true },
  );

/**
 * Drops jobs that have been in a terminal state for longer than `olderThan`.
 * Used by the media cleanup processor as a self-reference example and by
 * operators who want to keep the collection small.
 */
export const purgeTerminalJobsOlderThan = async (olderThan) => {
  const result = await Job.deleteMany({
    status: mongoose.trusted({
      $in: [JOB_STATUSES.COMPLETED, JOB_STATUSES.DEAD_LETTER],
    }),
    updatedAt: mongoose.trusted({ $lte: olderThan }),
  });
  return result.deletedCount ?? 0;
};

/**
 * Aggregates job counts by status. Used by the admin dashboard so operators
 * can spot a growing backlog without paginating through the full collection.
 */
export const aggregateStatusCounts = async (filter = {}) => {
  const match = {};
  if (filter.type) match.type = filter.type;
  if (filter.tenantId) {
    const tenantId = toObjectId(filter.tenantId);
    if (tenantId) match.tenantId = tenantId;
  }
  const rows = await Job.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const summary = { queued: 0, running: 0, completed: 0, failed: 0, dead_letter: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(summary, row._id)) {
      summary[row._id] = row.count;
    }
  }
  return summary;
};

export const listJobs = async ({ status, type, tenantId, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (tenantId) {
    const id = toObjectId(tenantId);
    if (id) filter.tenantId = id;
  }
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
  const [items, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Math.max(1, limit)),
    Job.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};
