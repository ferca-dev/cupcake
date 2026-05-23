# Phase 28 - Consent, Unsubscribe, and Suppression Lists

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-27.

## Goal

Add channel consent, unsubscribe, STOP/opt-out handling, and suppression lists so campaigns do not send messages to contacts that should not receive them.

## Scope

Implement consent and suppression infrastructure for email, SMS, and WhatsApp. Legal copy can be configurable but this phase is not a full compliance/legal review.

## Tasks

- Extend contacts with channel consent status, source, timestamp, and metadata.
- Add suppression list models for email, phone, WhatsApp, tenant, reason, source, and status.
- Add secure public email unsubscribe endpoint and confirmation page.
- Add provider callback handling for SMS STOP/opt-out where supported.
- Add WhatsApp opt-in/opt-out state tracking.
- Update campaign recipient validation to skip contacts without required consent or on suppression lists.
- Add skipped reasons for consent and suppression failures.
- Add admin/client UI to inspect suppression entries and consent status.
- Add import behavior that preserves suppression state.
- Add audit logs for consent and suppression changes.
- Add tests for unsubscribe, suppression filtering, campaign skips, tenant isolation, and callback idempotency.
- Update consent and suppression documentation in English.

## Suggested API Endpoints

- `POST /api/v1/public/unsubscribe/email`
- `GET /api/v1/public/unsubscribe/email/:token`
- `POST /api/v1/webhooks/twilio/opt-out`
- `GET /api/v1/suppression-list`
- `POST /api/v1/suppression-list`
- `DELETE /api/v1/suppression-list/:id`
- `PATCH /api/v1/contacts/:id/consent`

## Infrastructure Details Not To Miss

- Unsubscribe tokens must be signed or stored hashed.
- Suppression checks must run before token charging and provider calls.
- Suppressed/skipped recipients must not consume tokens.
- Opt-out callbacks must be idempotent.
- Consent state must be tenant-scoped.
- Do not allow clients to remove provider/legal suppression entries without appropriate permission.

## Verification

- Run backend and frontend tests.
- Unsubscribe an email contact and verify future email sends skip it.
- Process an SMS STOP callback and verify future SMS sends skip the number.
- Add a suppression entry manually and verify campaign sending respects it.
- Re-import a suppressed contact and verify suppression remains effective.
- Verify skipped reasons appear in campaign reports.

## Definition of Done

- Contacts have channel consent state.
- Email unsubscribe and SMS/WhatsApp opt-out handling are supported.
- Campaigns skip non-consented or suppressed recipients before charging tokens.
- Suppression and consent changes are auditable.
