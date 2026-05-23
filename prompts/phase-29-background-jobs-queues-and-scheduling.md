# Phase 29 - Background Jobs, Queues, and Scheduling

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-28.

## Goal

Move long-running, retryable, and scheduled work into a background job system with retries, dead-letter handling, status tracking, and operational visibility.

## Scope

Implement queue infrastructure and migrate critical async workflows. Do not overbuild distributed orchestration beyond product needs.

## Tasks

- Choose queue driver strategy: in-memory for local tests and Redis-backed for production.
- Add job model or queue metadata tracking for status visibility.
- Add worker process entrypoint.
- Add queue adapters for campaign sends, contact imports, exports, payment reminders, subscription reminders, webhook retries, media cleanup, and report generation.
- Add retry policies with exponential backoff.
- Add failed/dead-letter job tracking.
- Add scheduled job runner for reminders and cleanup.
- Make job processors idempotent.
- Add admin job monitoring UI or API.
- Add tests for enqueue, retry, dead-letter, idempotency, and worker execution.
- Update operations documentation in English.

## Suggested Environment Variables

```env
JOB_QUEUE_DRIVER="memory"
REDIS_URL=""
JOB_CONCURRENCY=5
JOB_MAX_ATTEMPTS=5
JOB_BACKOFF_SECONDS=30
```

## Infrastructure Details Not To Miss

- Request handlers should enqueue heavy work and return quickly.
- Jobs must carry tenant context explicitly.
- Failed jobs must preserve enough error information for support without leaking secrets.
- Payment and webhook jobs must remain idempotent.
- Campaign job retries must avoid duplicate provider sends.
- Local development must work without Redis.

## Verification

- Run backend tests.
- Enqueue a campaign send and verify worker processes it.
- Simulate provider failure and verify retry/dead-letter behavior.
- Enqueue payment reminder jobs and verify idempotent emails.
- Stop and restart worker and verify pending jobs continue.

## Definition of Done

- Critical async workflows run through queues/workers.
- Jobs have retries, failed-state tracking, and operational visibility.
- Scheduled reminders and cleanup tasks are supported.
- Local and production queue configurations are documented.
