# Mercado Pago Online Payments

Phase 24 wires Mercado Pago Checkout Pro (one-time token-package purchases) and
Mercado Pago Preapproval (recurring subscriptions) into Cupcake. All money
flows through Mercado Pago; Cupcake only mirrors the state, credits tokens
through the existing ledger, and sends transactional emails.

This document describes how the integration is shaped, how to configure it,
and how to verify it end to end.

## Goals

- Use only official Mercado Pago products and SDKs (Checkout Pro for
  one-time payments, Preapproval for recurring billing, the
  `mercadopago` Node SDK, and MercadoPago.js v2 on the frontend).
- Make the backend the single source of truth for payment state.
  Frontend redirects (`success`, `failure`, `pending`) are UX-only.
- Credit tokens through the existing immutable
  [token ledger](billing-architecture.md), exactly once per approved
  payment.
- Keep the integration optional. The product can run with
  `PAYMENT_PROVIDER=mock` for local development and tests without
  touching the Mercado Pago network.

## Architecture

```
+-----------------------------+      preference / preapproval     +----------------------------+
|  Client UI (Vue 3 + MP.js)  | --------------------------------> |  Mercado Pago Checkout     |
|  /app/billing/buy-tokens    | <-------------------------------- |  Pro / Preapproval         |
|  /app/billing/subscriptions |  redirect (success/failure/...)   +----------------------------+
+-----------------------------+                                                 |
                |                                                  webhook       |
                v                                                                v
+-----------------------------+      verified API fetch          +----------------------------+
|  Cupcake Backend            | <-------------------------------- |  Mercado Pago API          |
|  /api/v1/billing/...        |                                   |  /v1/payments/:id          |
|  /api/v1/webhooks/          |                                   |  /preapproval/:id          |
|     mercadopago             |                                   |  /authorized_payments/:id  |
+-----------------------------+                                   +----------------------------+
                |
                v
+--------------------+  +---------------------+  +-------------------+  +------------------------+
|  Token wallet      |  |  Payment ledger     |  |  Subscriptions    |  |  Transactional emails  |
|  + ledger          |  |  (transactions,     |  |  (plans, subs,    |  |  (payment_notifications|
|                    |  |   webhook events)   |  |   invoices)       |  |   idempotency keys)    |
+--------------------+  +---------------------+  +-------------------+  +------------------------+
```

The provider boundary is captured in
[`backend/src/modules/payments/providers/provider.types.js`](../backend/src/modules/payments/providers/provider.types.js).
The Mercado Pago adapter
([`mercadopago.provider.js`](../backend/src/modules/payments/providers/mercadopago.provider.js))
lazily imports the official `mercadopago` SDK; a deterministic mock
([`mock-payment.provider.js`](../backend/src/modules/payments/providers/mock-payment.provider.js))
is used by tests and by local dev when `PAYMENT_PROVIDER=mock`.

## Domain Models

All Phase 24 models live under
[`backend/src/modules/payments/`](../backend/src/modules/payments):

- **`payment_transactions`** — one row per Mercado Pago payment. Stores
  `provider`, `purpose`, `status`, `amountMinor`, `currency`, the
  Cupcake-controlled `externalReference`, the Mercado Pago
  `preferenceId` and `paymentId`, the package snapshot, and an
  idempotent `tokenCredited` flag. Refunds and chargebacks also carry
  `tokenReversed` and `tokenReversalLedgerEntryId` so a provider reversal
  can debit the wallet exactly once. The wallet is never credited or
  reversed twice for the same transaction.
- **`payment_webhook_events`** — immutable log of every Mercado Pago
  webhook delivery. The compound unique index
  `(provider, providerEventId)` is the single guarantee that repeated
  deliveries cannot double-process state. Signature verification status
  is stored alongside the raw payload for operator review.
- **`subscription_plans`** — global catalogue of recurring plans. Each
  plan records price, currency, interval, included tokens, and an
  optional `mercadoPagoPlanId` for projects that pre-create plans in
  Mercado Pago.
- **`tenant_subscriptions`** — per-tenant mirror of a Mercado Pago
  preapproval. Tracks `status`, `currentPeriodStart/End`, `nextChargeAt`,
  and lifecycle flags (`cancelAtPeriodEnd`, `cancelledAt`, `pausedAt`).
- **`subscription_invoices`** — one row per Mercado Pago authorized
  payment. The unique
  `mercadoPagoAuthorizedPaymentId` index keeps token crediting
  idempotent across renewals.
- **`payment_notifications`** — one row per outbound payment email. The
  unique `idempotencyKey` index is what makes the email pipeline safe
  under webhook retries.

## Token Crediting

Tokens are credited only after a trusted backend confirmation:

1. The webhook arrives at
   `POST /api/v1/webhooks/mercadopago`.
2. The handler checks `MERCADOPAGO_WEBHOOK_SECRET`. When set, the
   `x-signature` header must verify against the documented
   `id:<resource id>;request-id:<x-request-id>;ts:<ts>;` manifest. A
   mismatch returns `401` (the only response that triggers Mercado Pago's
   retry loop).
3. The handler inserts a `payment_webhook_events` row keyed by
   `providerEventId`. Repeated deliveries collapse into one row and
   short-circuit with `{ status: 'duplicate' }`.
4. The handler refetches the payment from the Mercado Pago API
   (`provider.fetchPayment(paymentId)`); the webhook payload itself is
   never trusted for state transitions.
5. The matching `payment_transactions` row is located by
   `external_reference` (preferred) or `providerPaymentId`. Status is
   updated.
6. If the new status is `approved` and `tokenCredited` is still false,
   `atomicCredit` runs on the tenant wallet, a `purchase` ledger entry
   is created with `referenceType: 'payment_transaction'`, and
   `tokenCredited` flips to true. Any further deliveries for the same
   payment id are no-ops on the wallet.
7. If a previously credited payment becomes `refunded` or
   `charged_back`, Cupcake attempts one wallet debit for the original
   token amount and records an `adjustment_debit` ledger entry with
   `referenceType: 'payment_transaction'`. If the tenant has already
   spent the tokens and the debit cannot be applied without taking the
   wallet below zero, the transaction metadata records
   `tokenReversalStatus: 'insufficient_balance'` for operator
   reconciliation.
8. The lifecycle email (pending / approved / rejected / cancelled /
   refunded / charged back / manual review) is dispatched with a deterministic
   idempotency key like `token_payment_approved:<transaction id>` so the
   same email cannot leave the system twice.

For subscriptions, the equivalent flow runs on the
`subscription_authorized_payment` webhook: a `subscription_invoices` row
is created or located, and the plan's `includedTokens` are credited
through the same ledger via a `credit` entry with
`referenceType: 'subscription_invoice'`.

## API Surface

Client (`/api/v1/billing`, requires `billing.view`):

| Method | Path                        | Purpose                                              |
| ------ | --------------------------- | ---------------------------------------------------- |
| POST   | `/mercadopago/preferences`  | Create a Checkout Pro preference for a token package |
| GET    | `/payments`                 | Tenant payment history                               |
| GET    | `/payments/:id`             | Single payment                                       |
| GET    | `/subscription-plans`       | Active recurring plans                               |
| GET    | `/subscriptions`            | Tenant subscriptions                                 |
| POST   | `/subscriptions`            | Create a Mercado Pago preapproval                    |
| POST   | `/subscriptions/:id/cancel` | Cancel the preapproval and the local mirror          |
| POST   | `/subscriptions/:id/pause`  | Pause the preapproval and the local mirror           |
| POST   | `/subscriptions/:id/resume` | Resume a paused subscription                         |
| GET    | `/subscription-invoices`    | Subscription invoice history                         |

Webhooks (`/api/v1/webhooks`):

| Method | Path           | Purpose                       |
| ------ | -------------- | ----------------------------- |
| POST   | `/mercadopago` | Mercado Pago webhook receiver |

Admin (`/api/v1/admin`, super-admin only):

| Method | Path                                                      | Purpose                                          |
| ------ | --------------------------------------------------------- | ------------------------------------------------ |
| GET    | `/payments`, `/payments/:id`                              | Cross-tenant payment inspection                  |
| GET    | `/payment-webhooks`                                       | Webhook delivery log                             |
| POST   | `/payments/reconcile`                                     | Re-apply a payment by id (recover lost webhooks) |
| GET    | `/subscription-plans`, `POST`, `PUT`, `PATCH /:id/status` | Plan catalogue                                   |
| GET    | `/subscriptions`                                          | Cross-tenant subscription roster                 |
| POST   | `/subscriptions/:id/sync`                                 | Force-resync from Mercado Pago                   |
| POST   | `/subscriptions/:id/cancel`                               | Cancel a tenant subscription                     |
| POST   | `/subscriptions/:id/pause`                                | Pause a tenant subscription                      |
| POST   | `/payments/reminders/low-balance`                         | Run low-balance reminder job manually            |
| POST   | `/payments/reminders/renewals`                            | Run renewal reminder job manually                |

## Frontend

- `/app/billing/buy-tokens` — Checkout Pro entry point. When
  `VITE_MERCADOPAGO_PUBLIC_KEY` is set, the Wallet brick from
  MercadoPago.js v2 is mounted inline; otherwise the user is redirected
  to `init_point` in a new tab.
- `/app/billing/subscriptions` — Plan catalogue, current subscription,
  pause/cancel/resume actions, and invoice history.
- `/app/billing/payment/{success,failure,pending}` — Read-only landing
  pages used by Mercado Pago `back_urls`. They look up the payment by
  reference but never mutate state.
- `/app/admin/payments` — Super-admin inspector for payments, webhook
  events, subscriptions, manual reconciliation, and reminder triggers.

The MercadoPago.js loader in
[`frontend/src/services/mercadopago-loader.js`](../frontend/src/services/mercadopago-loader.js)
inserts the official `sdk.mercadopago.com/js/v2` script on demand.

## Configuration

Backend (`backend/.env`):

```env
PAYMENT_PROVIDER="mock"            # or "mercadopago"
MERCADOPAGO_ENV="sandbox"          # sandbox | production
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

When `PAYMENT_PROVIDER=mercadopago`, env validation fails at boot if
`MERCADOPAGO_PUBLIC_KEY` or `MERCADOPAGO_ACCESS_TOKEN` are missing.
`MERCADOPAGO_WEBHOOK_SECRET` is optional — if blank, webhook signature
verification is skipped and the delivery is flagged for review.

Frontend (`frontend/.env`):

```env
VITE_MERCADOPAGO_PUBLIC_KEY=""
```

Leaving the public key empty disables the inline Wallet brick; the
purchase flow falls back to redirecting to `init_point`.

## Reminder Jobs

The `runLowTokenBalanceReminders` and `runRenewalReminders` jobs in
[`reminders.service.js`](../backend/src/modules/payments/reminders.service.js)
are designed to be invoked from an external scheduler (cron,
Kubernetes CronJob, GitHub Actions cron, …). Both rely on
`payment_notifications.idempotencyKey` so running them more than once a
day produces no extra emails. Admins can also fire them manually from
`/app/admin/payments`.

## Security Notes

- Mercado Pago secrets are never exposed to the frontend. Only
  `MERCADOPAGO_PUBLIC_KEY` is bundled into the SPA.
- The webhook controller never echoes payload data and only returns a
  short status envelope.
- The campaign delivery system already logs neither the SendGrid API key
  nor message bodies; the payment transactional email helper inherits
  the same restraint.
- `mongoose.trusted({...})` wraps the `$gte` / `$in` / `$lte` filters
  used by repository queries so the application-wide `sanitizeFilter`
  middleware does not strip operators (matching the existing token
  wallet repository).

## Verification

Backend:

```bash
cd backend
pnpm test
```

Tests under
[`backend/src/tests/payments.spec.js`](../backend/src/tests/payments.spec.js)
cover:

- Preference creation (success, unknown package, missing permission).
- Preference creation rejects client-supplied status, amount, and token
  mutation fields.
- Webhook idempotency: same payment id replayed → tokens credited once,
  ledger and email logs have one entry even across distinct webhook event ids.
- Approval, rejection, pending, cancelled, refunded, and charged-back
  statuses, including token reversal ledger entries for refunds and
  chargebacks.
- Webhook rejection on invalid signature when the secret is set.
- Signature verification receives the Mercado Pago resource id extracted
  from the webhook payload before any provider state is fetched.
- Notification idempotency under the unique `idempotencyKey` index.
- Low-balance reminder runs once per day.
- Subscription creation, conflict on a second active subscription,
  authorized-payment idempotent token credit, failed-payment retry
  reminders without token credit, pause/resume, and cancellation.
- Admin payment listing, reconciliation, and subscription sync require
  super-admin role. Reconciliation can be run repeatedly for the same
  provider payment id and still re-fetches current provider state.

Frontend:

```bash
cd frontend
pnpm test
```

The
[`billing-payments.store.test.js`](../frontend/src/tests/billing-payments.store.test.js)
suite exercises preference creation, subscription hydration, and error
capture.

## Sandbox Walkthrough

1. Set `PAYMENT_PROVIDER=mercadopago` plus the sandbox public key and
   access token from the Mercado Pago developer dashboard.
2. Expose `http://localhost:4000` to Mercado Pago using `ngrok`,
   Cloudflare Tunnel, or similar, and set `MERCADOPAGO_NOTIFICATION_URL`
   to the public URL ending in `/api/v1/webhooks/mercadopago`.
3. From the demo client account, navigate to
   `/app/billing/buy-tokens`, click "Pay with Mercado Pago", and
   complete the test payment using
   [Mercado Pago's documented test cards](https://www.mercadopago.com/developers/en/docs/checkout-pro/test-integration).
4. Confirm the webhook delivery in
   `/app/admin/payments` → "Webhook events", and the tokens credit in
   `/app/billing/tokens`.
5. Replay the same webhook from the Mercado Pago dashboard and verify
   the wallet does not change.
