# Phase 23 - Post Billing, Reports, Media, and Layout Hardening

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-22.

## Goal

Run a final verification pass after implementing token billing, send limits, survey reports, media storage, and centered fill-width layouts.

## Scope

This phase fixes integration gaps and regressions. Do not add major new features.

## Tasks

- Run the full backend test suite.
- Run the full frontend test suite.
- Run lint and formatting checks.
- Add missing regression tests for token balance, send limits, pricing changes, survey reports, media upload, tenant ownership, and layout primitives.
- Verify token debits are atomic under concurrent send attempts.
- Verify send limits prevent provider calls when exceeded.
- Verify skipped recipients do not consume tokens.
- Verify provider failures follow the configured refund policy.
- Verify admin-only token pricing and tenant limit configuration.
- Verify clients can view but not edit pricing and limits.
- Verify survey reports match raw database counts.
- Verify report exports do not leak unauthorized tenant/contact data.
- Verify media uploads cannot store invalid or oversized files.
- Verify production storage configuration fails clearly when incomplete.
- Verify local uploads are ignored by Git.
- Verify all major views use centered fill-width layout behavior.
- Update README, API docs, billing docs, report docs, storage docs, and `.context` in English if implementation details changed.
- Document remaining limitations clearly.

## Integration Scenarios

- Admin configures token package, channel costs, and tenant limits.
- Client requests or buys tokens.
- Admin approves a pending manual token purchase.
- Client sends a campaign with mixed valid and skipped recipients.
- Client attempts to send with insufficient balance and with exceeded limits.
- Client views survey reports for a campaign-linked survey and a public-link survey.
- Client uploads an image and uses it in an image block.
- Public respondent views and submits a survey containing stored images.
- Admin and client navigate reports and tables on large desktop and mobile.

## Infrastructure Details Not To Miss

- Do not hide billing or token failures behind generic campaign errors.
- Do not leave admin pricing changes unaudited.
- Do not let aggregate report endpoints return cross-tenant data.
- Do not serve private media without authorization or signed/public URL policy.
- Do not reintroduce narrow left-aligned layouts after centered fill-width work.

## Verification

- Full backend tests pass.
- Full frontend tests pass.
- Lint and formatting checks pass.
- Manual smoke tests pass for token purchase, token spend, campaign send, reports, media upload, public image rendering, and layout.
- Documentation is current and in English.

## Definition of Done

- Token billing and send limits are enforced and auditable.
- Survey statistical reports are accurate and tenant-safe.
- Image storage avoids MongoDB/server disk saturation and is provider-ready.
- Layout is centered and fill-width across supported viewports.
- The project is ready for the next product planning cycle.
