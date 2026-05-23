# Phase 34 - Production Readiness, Observability, and Backups

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-33.

## Goal

Prepare Cupcake for production operations with observability, backup/restore procedures, monitoring, runbooks, dependency checks, and launch readiness.

## Scope

This is an operational hardening phase. Do not add major product features.

## Tasks

- Add structured logging standards with request IDs and correlation IDs.
- Add metrics hooks for API latency, error rate, job queue depth, campaign sends, provider failures, payment failures, webhook failures, and storage errors.
- Add error monitoring integration points.
- Add health, readiness, and dependency checks.
- Define MongoDB backup and restore procedure.
- Define object storage backup/retention strategy.
- Add secret rotation guidance for JWT, Twilio, SendGrid, Mercado Pago, storage, API keys, and webhook secrets.
- Add dependency vulnerability scanning workflow.
- Add production environment validation.
- Add operational runbooks for payment incidents, failed webhooks, campaign failures, queue backlog, restore, storage outage, and compromised credentials.
- Add admin/support troubleshooting dashboards or endpoints where practical.
- Add load/smoke test scripts for critical flows.
- Add final production checklist in English.

## Infrastructure Details Not To Miss

- Do not log secrets or personal data unnecessarily.
- Dependency checks should fail readiness when critical dependencies are unavailable.
- Backup restore must be tested, not only documented.
- Jobs and webhooks need visibility for support.
- Alert thresholds must be practical and actionable.
- Production config must reject unsafe defaults.

## Verification

- Run full backend and frontend tests.
- Run lint and formatting checks.
- Run production config validation.
- Verify health/readiness endpoints.
- Simulate dependency failure and verify readiness fails.
- Run a backup/restore drill in a non-production environment.
- Run smoke tests for auth, survey publish, campaign send, response submit, token purchase, payment webhook, media upload, and reports.

## Definition of Done

- The system has production-grade observability hooks.
- Backup and restore procedures are tested.
- Operational runbooks exist for critical incidents.
- Unsafe production defaults are rejected.
- Cupcake is ready for deployment planning and launch review.
