import { z } from 'zod';
import mongoose from 'mongoose';

import * as jobService from './job.service.js';
import { JOB_STATUS_VALUES, JOB_TYPE_VALUES } from './job.constants.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { ValidationError } from '../../common/errors/index.js';

const listJobsQuerySchema = z.object({
  status: z.enum(JOB_STATUS_VALUES).optional(),
  type: z.enum(JOB_TYPE_VALUES).optional(),
  tenantId: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * Public projection. We deliberately strip the lock fields — they are an
 * implementation detail of the runner — and surface only what an operator
 * needs to triage: status, attempts, schedule, error, and payload.
 */
const toPublicJob = (job) => ({
  id: job._id.toString(),
  type: job.type,
  status: job.status,
  tenantId: job.tenantId ? job.tenantId.toString() : null,
  payload: job.payload ?? {},
  result: job.result ?? null,
  error: job.error
    ? {
        message: job.error.message ?? null,
        name: job.error.name ?? null,
        occurredAt: job.error.occurredAt ?? null,
      }
    : null,
  attempts: job.attempts ?? 0,
  maxAttempts: job.maxAttempts ?? 0,
  availableAt: job.availableAt ?? null,
  startedAt: job.startedAt ?? null,
  completedAt: job.completedAt ?? null,
  failedAt: job.failedAt ?? null,
  deadLetteredAt: job.deadLetteredAt ?? null,
  dedupeKey: job.dedupeKey ?? null,
  recurrence: job.recurrence ?? null,
  priority: job.priority ?? 0,
  enqueuedBy: job.enqueuedBy ? job.enqueuedBy.toString() : null,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

export const listJobs = asyncHandler(async (req, res) => {
  const query = listJobsQuerySchema.parse(req.query ?? {});
  const result = await jobService.listJobs(query);
  return sendSuccess(res, {
    data: {
      items: result.items.map(toPublicJob),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
      },
    },
    message: 'Jobs fetched',
  });
});

export const getJobStats = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query?.type && JOB_TYPE_VALUES.includes(req.query.type)) filter.type = req.query.type;
  if (req.query?.tenantId) filter.tenantId = req.query.tenantId;
  const counts = await jobService.getStatusCounts(filter);
  return sendSuccess(res, {
    data: { counts, filter },
    message: 'Job stats fetched',
  });
});

export const getJob = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ValidationError('Invalid job id');
  }
  const job = await jobService.getJob(req.params.id);
  return sendSuccess(res, { data: { job: toPublicJob(job) }, message: 'Job fetched' });
});

export const retryJob = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ValidationError('Invalid job id');
  }
  const job = await jobService.retryJob(req.params.id);
  return sendSuccess(res, { data: { job: toPublicJob(job) }, message: 'Job requeued' });
});

export const __testing = { toPublicJob };
