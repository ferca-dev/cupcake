import mongoose from 'mongoose';

import { JOB_STATUS_VALUES, JOB_STATUSES } from './job.constants.js';

const { Schema, Types } = mongoose;

/**
 * Persistent job record. The model is the queue: every driver — including
 * the Mongo-backed memory driver and the `inline` test driver — claims and
 * mutates these documents instead of holding state in memory. That way a
 * worker restart never loses queued work, and operators can inspect the
 * exact lifecycle of any job through the admin API.
 *
 * Field notes:
 *   - `dedupeKey`: optional unique key used to collapse repeated enqueues of
 *     the same logical action (e.g. "campaign.send:<campaignId>"). The
 *     partial unique index below only enforces uniqueness while the job is
 *     still active so a future retry of the same logical action is allowed
 *     after the previous one terminates.
 *   - `lockedAt` / `lockedBy`: cooperative lock owned by the driver that is
 *     currently executing the handler. A claim is reclaimable after the
 *     configured lock TTL so a crashed worker does not leave jobs stuck in
 *     `running` forever.
 *   - `availableAt`: next time the job is eligible to run. Set in the future
 *     to schedule retries with backoff or to delay execution.
 *   - `error`: redacted snapshot of the last failure. We only store a
 *     short message and stack tail so support can triage without leaking
 *     secrets that might appear in upstream errors.
 *   - `recurrence`: lightweight marker so scheduled jobs can be filtered in
 *     the admin UI even after they have completed.
 */
const jobErrorSchema = new Schema(
  {
    message: { type: String, default: null, maxlength: 500 },
    stack: { type: String, default: null, maxlength: 2000 },
    name: { type: String, default: null, maxlength: 120 },
    occurredAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const jobSchema = new Schema(
  {
    // Jobs may be global (super-admin reminders, media cleanup) so tenantId
    // is allowed to be null. When set it must carry the tenant context for
    // every processor that reads or writes tenant data.
    tenantId: { type: Types.ObjectId, ref: 'Tenant', default: null, index: true },
    type: { type: String, required: true, trim: true, maxlength: 100, index: true },
    status: {
      type: String,
      enum: JOB_STATUS_VALUES,
      default: JOB_STATUSES.QUEUED,
      index: true,
    },
    payload: { type: Schema.Types.Mixed, default: () => ({}) },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: jobErrorSchema, default: null },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 5, min: 1 },
    availableAt: { type: Date, default: () => new Date(), index: true },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null, trim: true, maxlength: 200 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    deadLetteredAt: { type: Date, default: null },
    dedupeKey: { type: String, default: null, trim: true, maxlength: 200 },
    recurrence: { type: String, default: null, trim: true, maxlength: 50 },
    enqueuedBy: { type: Types.ObjectId, ref: 'User', default: null },
    priority: { type: Number, default: 0, index: true },
  },
  { timestamps: true, collection: 'jobs' },
);

// Polling order: take the highest-priority queued job whose availableAt is in
// the past. The compound index keeps the common claim query a single index
// scan even as the collection grows.
jobSchema.index({ status: 1, availableAt: 1, priority: -1 });

// Dedupe is enforced ONLY while a job is still pending or in-flight. Once a
// job reaches a terminal state another enqueue with the same dedupeKey is
// allowed (e.g. retrying the same campaign send after the previous attempt
// reached the dead-letter queue and was manually requeued).
jobSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      dedupeKey: { $exists: true, $type: 'string' },
      status: { $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING, JOB_STATUSES.FAILED] },
    },
  },
);

export const Job = mongoose.models.Job ?? mongoose.model('Job', jobSchema);
