# Phase 14 - Hardening

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-13.

## Goal

Improve quality, security, reliability, accessibility, performance, documentation, and production readiness before considering the project commercially usable.

## Scope

This phase is not for new major product features. Fix foundational gaps and polish existing behavior.

## Tasks

- Run and fix backend tests.
- Run and fix frontend tests.
- Add missing tests for critical services: auth, tenant isolation, survey publishing, response validation, bulk send skipping, and permissions.
- Review MongoDB indexes for all high-traffic queries.
- Review input validation coverage for all public and protected endpoints.
- Review authorization coverage for all protected endpoints.
- Review rate limits for auth, public forms, and sends.
- Review error messages for clarity and absence of sensitive data.
- Review frontend route guards and token refresh behavior.
- Review responsive behavior for auth, dashboard, builder, public forms, contacts, campaigns, templates, billing, and admin.
- Review basic accessibility: labels, focus states, keyboard flow, color contrast, and semantic markup.
- Add or update API documentation in English.
- Add or update setup documentation in English.
- Add troubleshooting notes for local MongoDB, env vars, seeders, tests, and common startup issues.
- Remove dead code and misleading TODOs.
- Ensure seeders are idempotent and documented.
- Ensure `.context` reflects the final architecture.
- Prepare a concise production-readiness checklist.

## Infrastructure Details Not To Miss

- Verify the project can be installed from a clean clone.
- Verify no required environment variable is undocumented.
- Verify no committed file contains real secrets.
- Verify frontend build uses environment variables correctly.
- Verify backend production mode hides stack traces.
- Verify CORS, JWT secrets, and provider settings are environment-driven.
- Verify all generated URLs use configured app/frontend URLs.
- Verify all docs, comments, and code identifiers are in English.
- Verify user-facing strings are centralized or ready for i18n.

## Verification

- Clean install from scratch if practical.
- Start MongoDB through Docker Compose.
- Run backend seeders.
- Run backend tests.
- Run frontend tests.
- Run lint and formatting checks.
- Start backend and frontend.
- Smoke test login, survey creation, builder save, publish, public response, contacts, campaigns, dashboard, templates, transactions, and admin panel.
- Capture and document any remaining known limitations.

## Definition of Done

- Critical tests pass.
- No obvious security holes remain in implemented features.
- Documentation is complete enough for a new developer to run the project.
- The app can be installed, seeded, started, and smoke-tested from scratch.
- Remaining limitations are explicit and not hidden as silent failures.
