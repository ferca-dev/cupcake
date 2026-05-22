# Phase 24 - Mercado Pago Online Payments

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-23.

## Goal

Integrate Mercado Pago online payments for paid token purchases and recurring subscriptions, including trusted webhook processing, token crediting, payment reminders, subscription emails, payment confirmation emails, and billing UI.

## Official Documentation Baseline

Use only official Mercado Pago documentation and SDKs while implementing this phase:

- Checkout Pro for one-time token package purchases.
- MercadoPago.js SDK to initialize Checkout Pro from a backend-created preference.
- Mercado Pago webhooks/notifications for payment and subscription events.
- Mercado Pago Subscriptions/Preapproval for recurring payments and subscription management.

## Scope

Implement real online payment infrastructure. Do not credit tokens from frontend redirects. Do not store card data. Do not build a general accounting system beyond what is required for token purchases, subscriptions, invoices, and payment history.

## Tasks

- Add Mercado Pago configuration and environment validation.
- Install and isolate the official Mercado Pago backend SDK or documented API client behind a provider adapter.
- Add frontend MercadoPago.js integration for Checkout Pro token package purchases.
- Create backend endpoint to create Mercado Pago payment preferences for token packages.
- Store pending payment transaction records before redirecting/rendering checkout.
- Include a stable `external_reference` that maps the Mercado Pago preference/payment back to tenant, purchase, and package data.
- Implement Mercado Pago webhook endpoint.
- Verify webhook events by fetching the relevant Mercado Pago resource server-side before mutating internal state.
- Make webhook processing idempotent with stored event IDs and processed timestamps.
- Credit purchased tokens only after confirmed approved payment status.
- Update token purchase records for pending, approved, rejected, cancelled, refunded, charged back, and failed states.
- Add recurring subscription plan models and tenant subscription models.
- Create Mercado Pago subscription/preapproval flows for recurring plans.
- Store Mercado Pago preapproval IDs and authorized payment IDs.
- Sync subscription states from webhook events and periodic reconciliation where practical.
- Add subscription lifecycle actions: create, activate/sync, pause, cancel, and resume where supported.
- Generate subscription invoices or internal billing records for authorized payments.
- Send transactional payment emails for token purchase pending, approved, rejected, cancelled, refunded, and manual-review states.
- Send subscription emails for created, activated, paused, cancelled, renewal upcoming, payment approved, payment failed, and retry reminders.
- Send low-token balance reminder emails based on admin-configurable thresholds.
- Add notification log/idempotency so repeated webhooks do not send duplicate emails.
- Add admin UI to review Mercado Pago payment records, webhook events, subscriptions, failed payments, and token-credit outcomes.
- Add client UI for buying token packages, viewing payment status, viewing subscriptions, and managing subscription cancellation where allowed.
- Add tests for preference creation, webhook idempotency, token crediting, failed payment states, subscription state sync, and email idempotency.
- Update payment, token, subscription, and email documentation in English.

## Required Environment Variables

Backend `.env.example` must include:

```env
MERCADOPAGO_ENV="sandbox"
MERCADOPAGO_PUBLIC_KEY=""
MERCADOPAGO_ACCESS_TOKEN=""
MERCADOPAGO_WEBHOOK_SECRET=""
MERCADOPAGO_SUCCESS_URL="http://localhost:5173/billing/payment/success"
MERCADOPAGO_FAILURE_URL="http://localhost:5173/billing/payment/failure"
MERCADOPAGO_PENDING_URL="http://localhost:5173/billing/payment/pending"
MERCADOPAGO_NOTIFICATION_URL="http://localhost:4000/api/v1/webhooks/mercadopago"
MERCADOPAGO_STATEMENT_DESCRIPTOR="CUPCAKE"
PAYMENT_REMINDER_DAYS_BEFORE=3
LOW_TOKEN_BALANCE_THRESHOLD=100
```

Frontend `.env.example` must include:

```env
VITE_MERCADOPAGO_PUBLIC_KEY=""
```

## Suggested API Endpoints

Client:

- `POST /api/v1/billing/mercadopago/preferences`
- `GET /api/v1/billing/payments`
- `GET /api/v1/billing/payments/:id`
- `GET /api/v1/billing/subscriptions`
- `POST /api/v1/billing/subscriptions`
- `POST /api/v1/billing/subscriptions/:id/cancel`
- `POST /api/v1/billing/subscriptions/:id/resume`

Webhooks:

- `POST /api/v1/webhooks/mercadopago`

Admin:

- `GET /api/v1/admin/payments`
- `GET /api/v1/admin/payments/:id`
- `GET /api/v1/admin/payment-webhooks`
- `GET /api/v1/admin/subscriptions`
- `POST /api/v1/admin/subscriptions/:id/sync`

## Suggested Data Rules

- `payment_transactions` store provider, tenant, token purchase, subscription, amount, currency, status, Mercado Pago IDs, external reference, checkout URL, and metadata.
- `payment_webhook_events` store provider event ID, event type, resource ID, raw normalized payload, processed status, processing error, and timestamps.
- `subscription_plans` store plan name, price, currency, interval, included tokens, status, and Mercado Pago plan/preapproval references if used.
- `tenant_subscriptions` store tenant, plan, Mercado Pago preapproval ID, status, current period, cancellation status, and renewal metadata.
- `subscription_invoices` store tenant, subscription, authorized payment ID, amount, currency, status, period, and token crediting result.
- `payment_notifications` store tenant, user, type, reference, recipient email, status, sentAt, and idempotency key.

## Infrastructure Details Not To Miss

- Mercado Pago secrets must never be exposed to the frontend.
- Frontend must use only the public key.
- Backend must create payment preferences and subscriptions.
- Webhook handlers must acknowledge quickly and process safely.
- Repeated webhook delivery must not double-credit tokens.
- Frontend success/failure/pending URLs are UX-only and must not mutate payment state.
- Token credits must go through the same immutable token ledger from Phase 19.
- Subscription token allowances must be credited exactly once per paid period.
- Payment reminders should run from a scheduled job/worker, not from page loads.
- Email sending must be idempotent.
- All monetary amounts must use minor units or a documented decimal strategy consistently.
- Store currency explicitly.
- Add reconciliation tooling for payments where webhook delivery fails.
- Payment and subscription actions must be audited.

## Verification

- Run backend and frontend tests.
- Create a token package and generate a Mercado Pago checkout preference.
- Complete a sandbox/test approved payment and verify tokens are credited once.
- Replay the same webhook and verify tokens are not credited twice.
- Simulate rejected, pending, refunded, and cancelled states.
- Create a subscription/preapproval in sandbox/test mode.
- Process an authorized subscription payment and verify invoice/subscription state and token crediting.
- Verify payment confirmation, failure, reminder, and subscription emails are sent once.
- Verify clients cannot alter package price, token amount, payment status, or subscription state directly.
- Verify admin can inspect payments, webhooks, subscriptions, and token-credit results.

## Definition of Done

- Clients can buy token packages through Mercado Pago.
- Approved payments credit tokens through backend-confirmed, idempotent processing.
- Recurring subscriptions are integrated through Mercado Pago subscription/preapproval flows.
- Payment, subscription, reminder, and receipt emails are implemented and idempotent.
- Admins can inspect payment and subscription state.
- Mercado Pago setup is documented in English with sandbox and production configuration.
