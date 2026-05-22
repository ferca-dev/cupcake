# Phase 25 - Post Mercado Pago Payment Hardening

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-24.

## Goal

Run a final verification pass for Mercado Pago payments, token crediting, subscriptions, webhooks, reminders, receipts, and billing security.

## Scope

This phase fixes integration gaps and payment regressions. Do not add major new billing products.

## Tasks

- Run the full backend test suite.
- Run the full frontend test suite.
- Run lint and formatting checks.
- Add missing regression tests for Mercado Pago preference creation, webhook idempotency, payment status transitions, subscription renewals, token ledger crediting, and email idempotency.
- Verify every payment mutation is backend-driven.
- Verify frontend redirect pages never credit tokens directly.
- Verify Mercado Pago webhook replay does not duplicate token credits, invoice records, or emails.
- Verify approved token purchases credit exactly the purchased token amount.
- Verify refunded or charged-back payments create traceable debit/reversal ledger entries according to the documented policy.
- Verify subscription renewal credits are applied exactly once per paid billing period.
- Verify failed subscription payments trigger reminders without granting tokens.
- Verify cancellation/pause/resume flows match Mercado Pago state.
- Verify payment reminders and low-token reminders are scheduled, idempotent, and rate-limited.
- Verify admin payment views expose enough troubleshooting data without leaking secrets.
- Verify `.env.example` and docs separate sandbox/test and production setup.
- Verify Mercado Pago credentials, webhook secrets, and access tokens are never logged or exposed.
- Update README, billing docs, token docs, subscription docs, email docs, and `.context` in English if implementation details changed.

## Integration Scenarios

- Client buys a one-time token package and receives tokens after approved payment.
- Client abandons or leaves a payment pending and receives the correct pending/reminder email.
- Client payment is rejected and receives the correct failure email.
- Client payment is refunded and ledger reflects the reversal.
- Client starts a subscription and receives the correct subscription emails.
- Subscription renewal creates one invoice and one token credit.
- Failed subscription payment sends reminder emails and does not credit tokens.
- Admin reviews payment transaction, webhook events, subscription, invoice, notification log, and token ledger entry.

## Infrastructure Details Not To Miss

- Do not trust query params from success/failure URLs.
- Do not process webhooks without validating and verifying the referenced Mercado Pago resource.
- Do not send duplicate emails on webhook retries.
- Do not allow clients to call admin payment sync or mutation endpoints.
- Do not leave payment records without tenant ownership.
- Do not leave pending transactions unreconciled without a documented job or admin action.

## Verification

- Full backend tests pass.
- Full frontend tests pass.
- Lint and formatting checks pass.
- Manual sandbox smoke tests pass for token purchase, subscription, webhook replay, refund/rejection handling, and emails.
- Documentation is current and in English.

## Definition of Done

- Mercado Pago payments are secure, idempotent, and ledger-backed.
- Token purchases and subscriptions credit tokens only after trusted backend confirmation.
- Payment and subscription emails are reliable and deduplicated.
- Admin troubleshooting workflows are available.
- The billing system is ready for production credential configuration.
