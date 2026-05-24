# Background Jobs and Scheduling

The Cupcake backend runs long-running or retryable work in a background job
system instead of inside HTTP request/response cycles. This document covers
how the system is wired, how to run it locally and in production, and how to
operate it (retries, dead-letter, scheduled tasks).

## Why a job system

Several workflows are too slow or too risky to run inline:

- Campaign sends: thousands of provider calls; we want HTTP responses in
  milliseconds and retries that survive a worker restart.
- Payment reminders: low-token-balance and renewal reminders fire daily and
  must be idempotent across multiple admin clicks or scheduled runs.
- Future bulk workflows (contact import/export, response export, outbound
  webhook delivery, report generation) need the same guarantees, so the job
  types are wired now even though their business logic ships in later
  phases.

## Architecture

```
HTTP API ──enqueue──► [ Job collection (MongoDB) ] ◄──claim── Worker process
                            │
                            └── inline driver (tests / single-process dev)
```

- **Job collection** is the queue. Every driver writes to and reads from
  the same `jobs` collection so a worker restart never loses work and admin
  tooling can inspect the full lifecycle of any job.
- **Memory driver** runs the worker as a separate Node process that polls
  the collection. Default for development and production single-node
  deployments.
- **Inline driver** runs the handler synchronously inside the enqueueing
  process. Default for the test suite so HTTP responses can observe job
  side-effects without spinning up a worker.
- **Redis driver** is reserved for a future multi-node adapter. Selecting
  it today fails fast at startup so we never silently drop jobs onto an
  unimplemented backend.

### Files

| Path | Purpose |
| --- | --- |
| `backend/src/modules/jobs/job.model.js` | Mongoose schema (`Job`). |
| `backend/src/modules/jobs/job.constants.js` | Canonical job types and statuses. |
| `backend/src/modules/jobs/job.repository.js` | Atomic claim, retry, and dead-letter persistence. |
| `backend/src/modules/jobs/job.registry.js` | `jobType → handler` lookup. |
| `backend/src/modules/jobs/job.service.js` | Public enqueue / get / retry / list / stats API. |
| `backend/src/modules/jobs/job.runner.js` | Claim → execute → finalize cycle (shared by the worker and the inline driver). |
| `backend/src/modules/jobs/job.worker.js` | Polling loop with configurable concurrency. |
| `backend/src/modules/jobs/job.scheduler.js` | Recurring enqueues with calendar-day dedupe. |
| `backend/src/modules/jobs/processors/*` | Handlers for each registered job type. |
| `backend/src/worker.js` | Standalone worker entrypoint. |
| `backend/src/modules/jobs/job-admin.controller.js` | `/api/v1/admin/jobs` operator endpoints. |

## Job types

| Type | Trigger | Handler |
| --- | --- | --- |
| `campaign.send` | `POST /api/v1/campaigns/:id/send` | Calls the existing campaign send service. |
| `payment.reminder.low_balance` | Scheduler (daily) and admin trigger. | `runLowTokenBalanceReminders()`. |
| `payment.reminder.renewal` | Scheduler (daily) and admin trigger. | `runRenewalReminders()`. |
| `media.cleanup` | Scheduler (weekly). | `purgeDeletedImages()`. |
| `contact.import` | Reserved for the bulk import flow. | Placeholder — audits intent, returns `pending_implementation`. |
| `contact.export` | Reserved for the export flow. | Placeholder. |
| `response.export` | Reserved for the report export flow. | Placeholder. |
| `webhook.retry` | Reserved for outbound webhook deliveries. | Placeholder. |
| `report.generate` | Reserved for async report generation. | Placeholder. |

Placeholder processors are wired through the registry so future phases only
need to swap the handler body — no producer code changes required.

## Configuration

All knobs live in environment variables. Defaults in `.env.example`:

```
JOB_QUEUE_DRIVER="memory"     # memory | inline | redis(reserved)
REDIS_URL=""                  # required when JOB_QUEUE_DRIVER=redis (unimplemented)
JOB_CONCURRENCY=5             # number of polling loops per worker process
JOB_MAX_ATTEMPTS=5            # default retry budget when the job does not override
JOB_BACKOFF_SECONDS=30        # base seconds for the exponential backoff curve
JOB_POLL_INTERVAL_MS=500      # how long the worker sleeps when no jobs are ready
JOB_LOCK_TIMEOUT_MS=60000     # lock TTL; crashed workers reclaim after this
```

The test suite overrides these in `src/tests/setup.js` and defaults the
driver to `inline` so HTTP-level tests can observe job side-effects.

## Local development

```
# In one terminal — the HTTP server
pnpm --filter @cupcake/backend run dev

# In another terminal — the worker process
pnpm --filter @cupcake/backend run worker:dev
```

The worker process boots its own database connection and registers the
same processors as the API. It is safe to restart at any time: in-flight
jobs are reclaimed after `JOB_LOCK_TIMEOUT_MS`, and queued jobs survive
since they live in Mongo, not memory.

If you do not need background processing during a debugging session, leave
the worker stopped and set `JOB_QUEUE_DRIVER=inline` in your `.env` — every
enqueue will run the handler synchronously inside the API process. This is
the same mode the test suite uses.

## Production

- Deploy the API (`pnpm run start`) and the worker (`pnpm run worker`) as
  separate processes that share the same MongoDB connection.
- Run one worker process per host. The memory driver coordinates through
  MongoDB so multiple worker processes on the same database can coexist
  safely; each will claim distinct jobs via the atomic `findOneAndUpdate`.
- Keep `JOB_QUEUE_DRIVER=memory` until the Redis adapter ships. The Redis
  selector fails fast on boot today.
- Scheduled jobs are enqueued by the worker on boot and re-checked once an
  hour. The calendar-day dedupe key means a multi-instance deployment will
  not produce duplicate reminders.

## Retries, backoff, and dead-letter

- Every handler throw becomes a retry. Attempts are tracked on the job
  document.
- Next-run is computed with exponential backoff and ±25 % jitter:
  `JOB_BACKOFF_SECONDS × 2^(attempts-1)`, capped at one hour. The jitter
  prevents synchronized retries across tenants from hammering external
  providers.
- After `maxAttempts`, the job transitions to `dead_letter`. It stays there
  until an operator inspects it and either deletes it or retries it via
  `POST /api/v1/admin/jobs/:id/retry`.
- Campaign sends use `maxAttempts: 1` because the underlying service
  rejects a re-run while the campaign is in `sending`. Operators are
  expected to inspect the campaign and explicitly requeue if needed —
  retrying blindly could double-spend tokens or duplicate provider calls.

## Idempotency

- The runtime is at-least-once. Handlers must be safe to re-run.
- `dedupeKey` collapses repeated enqueues while the previous job is still
  active (`queued | running | failed`). The campaign send producer uses
  `campaign.send:<campaignId>`; payment reminders use a date-stamped key so
  re-running the scheduler on the same UTC day is a no-op.
- Provider-facing handlers must guard against duplicate side-effects:
  - Payment notifications use `payment_notifications.idempotencyKey`.
  - Campaign sends rely on the underlying service's state machine, which
    refuses to send a campaign that is already in a terminal status.
  - Mercado Pago webhooks dedupe by event id at the storage layer.

## Operator visibility

Super-admin only. Routes mounted under `/api/v1/admin/jobs`:

- `GET /api/v1/admin/jobs?status=...&type=...&page=...&limit=...` — paginated list.
- `GET /api/v1/admin/jobs/stats?type=...&tenantId=...` — counts by status.
- `GET /api/v1/admin/jobs/:id` — single job, including the (capped) error
  message and stack.
- `POST /api/v1/admin/jobs/:id/retry` — only valid for jobs in `failed` or
  `dead_letter`. The endpoint bumps `maxAttempts` so the requeue is
  guaranteed at least one more attempt.

## Failure runbook

1. Identify the failing job(s):
   `GET /api/v1/admin/jobs?status=dead_letter`.
2. Inspect the `error.message` and `payload`. The `error.stack` field has
   the most recent stack trace tail (≤ 2 KB) for triage; it intentionally
   omits secrets via the same logger redaction list.
3. Fix the root cause (provider outage, malformed payload, missing
   credentials, etc.).
4. Requeue with `POST /api/v1/admin/jobs/:id/retry`. The runner will pick
   it up at the next poll tick.
5. For campaign sends specifically: also verify the campaign status. If it
   is stuck in `sending` and recipients exist in `pending`, contact
   engineering before retrying — a partial dispatch retry could resend.

## Verification

The job system is covered by `src/tests/jobs.spec.js` (15 specs):

- Inline driver runs handlers synchronously and surfaces domain errors.
- Failed handlers schedule a retry with backoff; exhausted attempts move
  to `dead_letter`.
- `dedupeKey` collapses concurrent enqueues.
- A worker (memory driver) drains pending jobs across multiple loops.
- Stale-locked jobs are reclaimable after the lock TTL.
- Admin API enforces super-admin and exposes retry/stats/list.

The existing campaign tests (`src/tests/campaigns.spec.js`,
`src/tests/campaigns-phase15.spec.js`) continue to pass because the
inline driver delivers the same `{ campaign, summary, tokens }` payload
the previous synchronous endpoint did.
