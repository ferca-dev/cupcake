import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import {
  startInMemoryMongo,
  stopInMemoryMongo,
  clearCollections,
} from './helpers/mongo.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Job } from '../modules/jobs/job.model.js';
import { JOB_STATUSES, JOB_TYPES } from '../modules/jobs/job.constants.js';
import {
  enqueueJob,
  retryJob,
  resolveDriverName,
} from '../modules/jobs/job.service.js';
import { registerJobHandler, clearJobHandlers } from '../modules/jobs/job.registry.js';
import { runJobOnce, computeNextRunAt } from '../modules/jobs/job.runner.js';
import { createJobWorker } from '../modules/jobs/job.worker.js';
import { registerAllProcessors } from '../modules/jobs/processors/index.js';
import { loadEnv, resetEnvCache } from '../config/env.js';

let app;
const password = 'StrongPass123!';

const setEnv = (key, value) => {
  if (value === undefined || value === null) delete process.env[key];
  else process.env[key] = String(value);
  resetEnvCache();
};

const seedSuperAdmin = async () => {
  const user = await User.create({
    tenantId: null,
    role: ROLES.SUPER_ADMIN,
    name: 'Super',
    email: 'super@cupcake.test',
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  return user;
};

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

beforeAll(async () => {
  await startInMemoryMongo();
  app = createApp();
});

afterAll(async () => {
  await stopInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
  // Each test re-registers handlers so a test that swaps in a stub cannot
  // leak the stub into the next test.
  registerAllProcessors();
});

afterEach(() => {
  // Tests that flip JOB_QUEUE_DRIVER (e.g. dedupe / worker drain) must not
  // leak their override into later tests. Always restore the inline default
  // and force the env cache to reload on the next loadEnv() call.
  setEnv('JOB_QUEUE_DRIVER', 'inline');
});

describe('jobs: enqueue and inline driver', () => {
  it('runs the handler synchronously and records the result when driver is inline', async () => {
    // The test setup defaults to JOB_QUEUE_DRIVER=inline.
    expect(resolveDriverName()).toBe('inline');

    // Swap the placeholder webhook-retry handler for a deterministic one.
    clearJobHandlers();
    registerJobHandler(JOB_TYPES.WEBHOOK_RETRY, async (payload) => ({
      doubled: (payload.value ?? 0) * 2,
    }));

    const job = await enqueueJob({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: { value: 21 },
    });

    expect(job.status).toBe(JOB_STATUSES.COMPLETED);
    expect(job.result).toEqual({ doubled: 42 });
    expect(job.attempts).toBe(1);
    expect(job.startedAt).toBeInstanceOf(Date);
    expect(job.completedAt).toBeInstanceOf(Date);
  });

  it('rejects unknown job types at enqueue time', async () => {
    await expect(
      enqueueJob({ type: 'totally.fake.type', payload: {} }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('jobs: retry with backoff and dead-letter', () => {
  it('retries failed jobs with exponential backoff before dead-lettering', async () => {
    clearJobHandlers();
    let attempts = 0;
    registerJobHandler(JOB_TYPES.WEBHOOK_RETRY, async () => {
      attempts += 1;
      throw new Error(`forced failure ${attempts}`);
    });

    let thrown = null;
    try {
      await enqueueJob({
        type: JOB_TYPES.WEBHOOK_RETRY,
        payload: {},
        maxAttempts: 3,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeNull();
    expect(attempts).toBe(1);

    // The inline driver ran one attempt before re-throwing. The job should
    // now be in `failed` state with an availableAt in the future.
    const job = await Job.findOne({ type: JOB_TYPES.WEBHOOK_RETRY });
    expect(job).not.toBeNull();
    expect(job.status).toBe(JOB_STATUSES.FAILED);
    expect(job.attempts).toBe(1);
    expect(job.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(job.error?.message).toContain('forced failure');
  });

  it('moves to dead_letter after exhausting attempts', async () => {
    clearJobHandlers();
    registerJobHandler(JOB_TYPES.WEBHOOK_RETRY, async () => {
      throw new Error('always fails');
    });

    // Manually create a job that has already burned its retry budget so the
    // next attempt must transition straight to dead_letter.
    const job = await Job.create({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: {},
      status: JOB_STATUSES.QUEUED,
      attempts: 2,
      maxAttempts: 3,
      availableAt: new Date(Date.now() - 1000),
    });

    const result = await runJobOnce({ workerId: 'test-worker' });
    expect(result).not.toBeNull();
    expect(result._id.toString()).toBe(job._id.toString());
    expect(result.status).toBe(JOB_STATUSES.DEAD_LETTER);
    expect(result.deadLetteredAt).toBeInstanceOf(Date);
    expect(result.error?.message).toBe('always fails');
  });

  it('applies jitter inside the configured backoff curve', () => {
    const nextRunAt = computeNextRunAt({ attempts: 3, baseSeconds: 30 });
    const seconds = (nextRunAt.getTime() - Date.now()) / 1000;
    // attempts=3 → 2^2=4x base → 120s; jitter is ±25% so the bound is
    // generous but still detectable if we ever regress to no backoff.
    expect(seconds).toBeGreaterThan(60);
    expect(seconds).toBeLessThan(200);
  });
});

describe('jobs: dedupe and idempotency', () => {
  it('collapses repeated enqueues with the same dedupeKey while the job is active', async () => {
    clearJobHandlers();
    // mongodb-memory-server builds indexes lazily. Force the unique partial
    // index to be ready before the second insert; otherwise the duplicate
    // would silently succeed.
    await Job.syncIndexes();
    // Switch to memory driver so the job stays in `queued` after enqueue
    // and the second call observes the dedupe partial index.
    setEnv('JOB_QUEUE_DRIVER', 'memory');

    const first = await enqueueJob({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: { v: 1 },
      dedupeKey: 'dup-key-1',
    });
    const second = await enqueueJob({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: { v: 2 },
      dedupeKey: 'dup-key-1',
    });

    expect(first._id.toString()).toBe(second._id.toString());
    expect(second.payload).toEqual({ v: 1 });

    const count = await Job.countDocuments({ dedupeKey: 'dup-key-1' });
    expect(count).toBe(1);
  });

  it('handler runs at-least-once: caller-side dedupe is the contract', async () => {
    // The contract is that the runtime delivers at-least-once. Handlers
    // therefore must be idempotent. We exercise that contract by running
    // the same job twice and observing the handler runs twice.
    let runs = 0;
    clearJobHandlers();
    registerJobHandler(JOB_TYPES.WEBHOOK_RETRY, async () => {
      runs += 1;
      return { runs };
    });

    await Job.create({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: {},
      status: JOB_STATUSES.QUEUED,
      attempts: 0,
      maxAttempts: 3,
      availableAt: new Date(Date.now() - 1000),
    });

    const first = await runJobOnce({ workerId: 'w1' });
    expect(first.status).toBe(JOB_STATUSES.COMPLETED);
    expect(runs).toBe(1);

    // Re-queue and re-run to simulate a worker restart picking the same
    // logical job up again — the handler must still run.
    const requeued = await Job.findByIdAndUpdate(
      first._id,
      {
        $set: {
          status: JOB_STATUSES.QUEUED,
          availableAt: new Date(Date.now() - 1000),
          attempts: 0,
        },
      },
      { new: true },
    );
    expect(requeued.status).toBe(JOB_STATUSES.QUEUED);

    const second = await runJobOnce({ workerId: 'w2' });
    expect(second.status).toBe(JOB_STATUSES.COMPLETED);
    expect(runs).toBe(2);
  });
});

describe('jobs: worker resume', () => {
  it('claims a stale-locked job after the lock TTL expires', async () => {
    const env = loadEnv();
    const staleLockAt = new Date(Date.now() - env.JOB_LOCK_TIMEOUT_MS - 1000);
    const job = await Job.create({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: {},
      status: JOB_STATUSES.RUNNING,
      attempts: 1,
      maxAttempts: 3,
      availableAt: new Date(Date.now() - 5000),
      lockedAt: staleLockAt,
      lockedBy: 'crashed-worker',
    });

    clearJobHandlers();
    registerJobHandler(JOB_TYPES.WEBHOOK_RETRY, async () => ({ ok: true }));

    const result = await runJobOnce({ workerId: 'resumed-worker' });
    expect(result).not.toBeNull();
    expect(result._id.toString()).toBe(job._id.toString());
    expect(result.status).toBe(JOB_STATUSES.COMPLETED);
    expect(result.lockedBy).toBeNull();
  });

  it('memory driver worker drains pending jobs after start', async () => {
    setEnv('JOB_QUEUE_DRIVER', 'memory');
    setEnv('JOB_CONCURRENCY', '2');

    clearJobHandlers();
    const seen = [];
    registerJobHandler(JOB_TYPES.WEBHOOK_RETRY, async (payload) => {
      seen.push(payload.tag);
      return { tag: payload.tag };
    });

    await enqueueJob({ type: JOB_TYPES.WEBHOOK_RETRY, payload: { tag: 'a' } });
    await enqueueJob({ type: JOB_TYPES.WEBHOOK_RETRY, payload: { tag: 'b' } });
    await enqueueJob({ type: JOB_TYPES.WEBHOOK_RETRY, payload: { tag: 'c' } });

    const worker = createJobWorker({ workerId: 'phase29-test' });
    worker.start();
    // Wait until every job has been processed. Polling here is faster than
    // sleeping a fixed duration and keeps the test deterministic.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const remaining = await Job.countDocuments({
        type: JOB_TYPES.WEBHOOK_RETRY,
        status: { $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING] },
      });
      if (remaining === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await worker.stop();

    expect(seen.sort()).toEqual(['a', 'b', 'c']);
    setEnv('JOB_QUEUE_DRIVER', 'inline');
    setEnv('JOB_CONCURRENCY', '2');
  });
});

describe('jobs: campaign send integration', () => {
  it('enqueueing a campaign send drives it to completion (inline driver)', async () => {
    // Reuse the campaign module surfaces: we cannot easily call the HTTP
    // path here without rebuilding fixtures, so we exercise the processor
    // directly with a synthetic campaign payload that should fail with a
    // clean NotFoundError. The job should still flow through the runner
    // and end up dead-lettered.
    const { campaignId } = { campaignId: '507f1f77bcf86cd799439011' };
    let thrown = null;
    try {
      await enqueueJob({
        type: JOB_TYPES.CAMPAIGN_SEND,
        payload: { campaignId, tenantId: '507f1f77bcf86cd799439012' },
        maxAttempts: 1,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeNull();
    const job = await Job.findOne({ type: JOB_TYPES.CAMPAIGN_SEND });
    expect(job.status).toBe(JOB_STATUSES.DEAD_LETTER);
  });
});

describe('jobs: scheduled reminders', () => {
  it('runs the low-balance reminder processor without throwing on an empty wallet set', async () => {
    const job = await enqueueJob({
      type: JOB_TYPES.PAYMENT_REMINDER_LOW_BALANCE,
      payload: { triggeredBy: 'test' },
      maxAttempts: 1,
    });
    expect(job.status).toBe(JOB_STATUSES.COMPLETED);
    expect(job.result).toMatchObject({ processed: 0 });
  });
});

describe('jobs: admin API', () => {
  it('lists, fetches, and retries jobs', async () => {
    const admin = await seedSuperAdmin();
    const token = await login(admin.email);

    // Create a pre-failed job we can retry.
    const job = await Job.create({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: { v: 1 },
      status: JOB_STATUSES.DEAD_LETTER,
      attempts: 3,
      maxAttempts: 3,
      deadLetteredAt: new Date(),
      availableAt: new Date(),
      error: { message: 'boom' },
    });

    const list = await request(app)
      .get('/api/v1/admin/jobs')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBe(1);
    expect(list.body.data.items[0].id).toBe(job._id.toString());

    const stats = await request(app)
      .get('/api/v1/admin/jobs/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.counts.dead_letter).toBe(1);

    const detail = await request(app)
      .get(`/api/v1/admin/jobs/${job._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.job.error.message).toBe('boom');

    // Provide a known handler so the retried run succeeds.
    clearJobHandlers();
    registerJobHandler(JOB_TYPES.WEBHOOK_RETRY, async () => ({ retried: true }));

    const retried = await request(app)
      .post(`/api/v1/admin/jobs/${job._id.toString()}/retry`)
      .set('Authorization', `Bearer ${token}`);
    expect(retried.status).toBe(200);
    expect(retried.body.data.job.status).toBe(JOB_STATUSES.QUEUED);
    expect(retried.body.data.job.maxAttempts).toBeGreaterThanOrEqual(4);
  });

  it('forbids non-super-admins from listing jobs', async () => {
    const tenant = await Tenant.create({ name: 'Acme', slug: 'acme', status: 'active' });
    const user = await User.create({
      tenantId: tenant._id,
      role: ROLES.CLIENT_ADMIN,
      name: 'Client',
      email: 'client@cupcake.test',
      passwordHash: await hashPassword(password),
      status: 'active',
    });
    tenant.ownerUserId = user._id;
    await tenant.save();
    const token = await login(user.email);

    const resp = await request(app)
      .get('/api/v1/admin/jobs')
      .set('Authorization', `Bearer ${token}`);
    expect(resp.status).toBe(403);
  });
});

describe('jobs: retry validation', () => {
  it('rejects retrying a completed or running job', async () => {
    const job = await Job.create({
      type: JOB_TYPES.WEBHOOK_RETRY,
      payload: {},
      status: JOB_STATUSES.COMPLETED,
      attempts: 1,
      maxAttempts: 3,
      completedAt: new Date(),
      availableAt: new Date(),
    });
    await expect(retryJob(job._id)).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('jobs: campaign send via HTTP', () => {
  it('returns the summary inline (single-process driver)', async () => {
    // Lightweight end-to-end-ish path: create tenant, survey, campaign, and
    // verify that sending it returns the summary as the previous synchronous
    // endpoint did, but now via the job runner.
    const { Survey } = await import('../modules/surveys/survey.model.js');
    const { SurveyVersion } = await import('../modules/surveys/survey-version.model.js');
    const { Contact } = await import('../modules/contacts/contact.model.js');
    const tenant = await Tenant.create({ name: 'Acme', slug: 'acme-jobs', status: 'active' });
    const user = await User.create({
      tenantId: tenant._id,
      role: ROLES.CLIENT_ADMIN,
      name: 'Client',
      email: 'jobs-client@cupcake.test',
      passwordHash: await hashPassword(password),
      status: 'active',
    });
    tenant.ownerUserId = user._id;
    await tenant.save();
    const token = await login(user.email);

    const contact = await Contact.create({
      tenantId: tenant._id,
      fullName: 'Recipient',
      email: 'recipient@example.com',
      status: 'active',
    });

    const survey = await Survey.create({
      tenantId: tenant._id,
      title: 'Jobs survey',
      description: null,
      slug: 'jobs-survey',
      status: 'published',
      currentDraftSchema: {
        fields: [],
        sections: [],
        logicRules: [],
        layout: { mode: 'single_page', showProgress: true },
      },
      settings: {},
      createdBy: user._id,
    });
    const version = await SurveyVersion.create({
      tenantId: tenant._id,
      surveyId: survey._id,
      versionNumber: 1,
      schema: survey.currentDraftSchema,
      publishedBy: user._id,
      publishedAt: new Date(),
    });
    survey.publishedVersionId = version._id;
    await survey.save();

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Email send',
        surveyId: survey._id.toString(),
        channels: ['email'],
        target: { contactIds: [contact._id.toString()] },
      });
    expect(created.status).toBe(201);

    const sent = await request(app)
      .post(`/api/v1/campaigns/${created.body.data.campaign.id}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.jobId).toEqual(expect.any(String));
    expect(sent.body.data.summary).toBeDefined();
    expect(sent.body.data.summary.sentCount).toBe(1);

    const job = await Job.findById(sent.body.data.jobId);
    expect(job.status).toBe(JOB_STATUSES.COMPLETED);
    expect(job.type).toBe(JOB_TYPES.CAMPAIGN_SEND);
    expect(job.dedupeKey).toBe(`campaign.send:${created.body.data.campaign.id}`);
  });
});
