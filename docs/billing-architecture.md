# Billing and Transactions Architecture

Phase 12 introduces a billing transaction history that the product can read,
filter, and audit today. No real payment provider (Stripe, MercadoPago, etc.)
is integrated — every transaction in the database is either demo seed data or
something explicitly inserted by an internal tool. This document captures the
boundaries that future payment-provider integrations must respect so the
domain code does not have to change when a real provider is wired up.

## Goals

- Persist a clean, tenant-scoped billing history that's safe to expose today.
- Keep the schema close to what real providers expect so the migration to a
  live integration is additive, not destructive.
- Never imply that a real charge took place. Demo transactions render as
  ordinary history rows without leaking implementation details to end users.
- Make the eventual provider boundary obvious and small.

## The Transaction Model

[`transactions`](../backend/src/modules/transactions/transaction.model.js)
stores monetary records with these shape guarantees:

- `tenantId` is required. Tenant isolation is enforced in the service layer
  before the database is touched.
- `type` ∈ `payment | refund | credit | adjustment`.
- `status` ∈ `pending | paid | failed | refunded | cancelled`.
- `amount` is stored as **integer minor currency units** (e.g. cents for USD,
  centavos for MXN). This matches the API conventions of every major
  payment provider and avoids floating-point rounding. The frontend divides
  by 100 only at render time.
- `currency` is an ISO 4217 three-letter code, stored uppercase. It is
  required for every transaction so the (amount, currency) pair is always
  meaningful.
- `provider` is nullable. Today every record is created internally and the
  field stays `null`. When a real adapter ships it sets a stable identifier
  (`stripe`, `mercadopago`, …).
- `providerReference` is nullable. Indexed (sparsely) so future
  reconciliation jobs can look up our transactions by the remote ID.
- `description` is freeform user-facing text. UI surfaces it directly; do
  not encode internal flags in it.
- `planCode` is an optional opaque slug (`pro_monthly`, `enterprise_annual`,
  …). Once a `Plan` collection ships this field can be migrated to an
  ObjectId reference without breaking existing rows.
- `paidAt` is the moment the funds settled (nullable for pending/failed).
- `initiatedBy` optionally points to the user who triggered the action.

Indexes: `tenantId+createdAt`, `tenantId+status`, `tenantId+type`, and a
sparse index on `providerReference`. The compound indexes power the
`/transactions` list endpoint and its filters; the sparse index supports
provider webhook callbacks.

## API Surface

Routes live under `/api/v1/transactions` and require the `billing.view`
permission:

| Method | Path                | Description                                                                            |
| ------ | ------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/transactions`     | Tenant-scoped list with `status`, `type`, `provider`, `page`, `limit`, `sort` filters. |
| GET    | `/transactions/:id` | Single transaction by id.                                                              |

Tenant scoping rules:

- **Client users** (`client_admin`, `client_member`) only see records where
  `tenantId` matches their own. The repository receives the tenant id from
  `req.tenantContext.tenantId` and applies it before every query.
- **Super admins** without an `x-impersonate-tenant` header see every
  tenant's transactions. Each global list/read produces an audit log entry
  (`transaction.listed_by_super_admin`, `transaction.viewed_by_super_admin`)
  so cross-tenant access is reviewable.
- **Super admins** with the impersonation header see only that tenant —
  same scope as a client admin would. The audit entry records the tenant
  scope so reviewers can tell global from impersonated reads apart.

## Future Provider Boundary

When a real payment provider is added, only one new module enters the code
base. Existing transaction reads, the list/detail endpoints, and the audit
behaviour are untouched.

The boundary is captured in
[`backend/src/modules/transactions/providers/provider.types.js`](../backend/src/modules/transactions/providers/provider.types.js).
The interface to implement is:

```js
{
  getProviderName(): string,

  createCharge({
    tenantId, amount, currency, description, planCode, metadata
  }): Promise<{ providerReference, status, paidAt, raw }>,

  refundCharge({ providerReference, amount, reason }):
    Promise<{ providerReference, status, raw }>,

  normalizeStatus(rawStatus):
    'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled',
}
```

Integration checklist for the first real adapter:

1. Implement the interface in
   `backend/src/modules/transactions/providers/<vendor>.provider.js`.
2. Add a `provider.factory.js` (mirroring the campaigns module pattern) that
   resolves the active provider from the environment, e.g. `BILLING_PROVIDER`.
3. Introduce a `POST /transactions` (or similar) endpoint guarded by an
   internal-only permission that calls `provider.createCharge`, persists the
   resulting transaction with the real `provider` and `providerReference`,
   and emits an audit event.
4. Register a webhook receiver under `/webhooks/<vendor>` that translates
   incoming events using `provider.normalizeStatus` and updates the
   matching transaction by `providerReference`.
5. Keep amounts as integer minor units end-to-end — never convert to
   floating-point until the very last UI render step.

The read endpoints (`GET /transactions`, `GET /transactions/:id`) and the
existing audit behaviour do **not** need any changes when the provider ships.

## Frontend Boundary

The frontend store (`stores/transactions.store.js`) and view
(`views/billing/TransactionHistoryView.vue`) treat every transaction as
plain history. The provider column displays the stored `provider` value
verbatim or "Internal" when null — there is no copy that promises a live
payment integration. When a real provider is wired up the labels in the
i18n bundle (`billing.transactions.providers.*`) can be extended without
touching the view.

## Verification

Backend tests:

- `transactions.spec.js` covers tenant isolation, super admin access plus
  audit logging, permission enforcement, filtering, and model invariants
  (integer amount, ISO currency code, currency normalisation).

Frontend tests:

- `transactions.store.test.js` covers list hydration, error capture, filter
  reset semantics, detail loading, query-string forwarding, and reset.

Manual verification:

1. Run `pnpm seed` from `backend/`.
2. Sign in with the demo client (`client@cupcake.local`) and open
   `/app/billing/transactions`. The seeded history (payments, a refund, a
   credit, a pending entry, and a failed entry) should render with amounts
   formatted via the current locale.
3. Sign in with the super admin (`admin@cupcake.local`) and open the same
   route. The list returns transactions across every tenant; setting the
   `x-impersonate-tenant` header narrows the result back to the targeted
   tenant.
4. Create a fresh tenant with no transactions and confirm the empty state
   renders without errors.

## Token Wallet, Send Limits, and Admin Pricing (Phase 19)

Phase 19 layers an internal prepaid-token economy on top of the existing
billing primitives. Tokens are **not** cryptocurrency — they are accounting
credits Cupcake uses to meter and limit channel sends.

### Domain entities

All models live under
[`backend/src/modules/tokens/`](../backend/src/modules/tokens):

- `token_wallets` — one document per tenant. Stores the live integer
  balance plus lifetime credited/debited/refunded counters used for
  reconciliation. The wallet document is updated through atomic
  `findOneAndUpdate` operations so concurrent campaigns cannot double-spend.
- `token_ledger_entries` — immutable history. Every change to a wallet
  produces exactly one entry: `credit`, `debit`, `refund`,
  `adjustment_credit`, `adjustment_debit`, or `purchase`. Entries record the
  amount (always non-negative — the sign comes from `type`), the
  `balanceAfter`, and a `referenceType + referenceId` pointer back to the
  triggering campaign recipient, manual adjustment, or purchase.
- `token_packages` — super-admin-curated catalogue of token bundles. Each
  package stores `tokens`, `priceMinor`, and `currency` (ISO 4217). Prices
  use integer minor units, matching the transaction model.
- `channel_pricing_rules` — one document per channel
  (`email | sms | whatsapp`) defining `tokensPerRecipient`. The default
  rate comes from `DEFAULT_*_TOKEN_COST` env vars. Updating a rule never
  rewrites historical ledger entries; each entry's `metadata.tokensPerRecipient`
  captures the rate at debit time.
- `tenant_send_limits` — per-tenant monthly caps. `monthlyTotal` and the
  three per-channel fields can each be `null` (no limit). `enforcement` is
  `hard` (block the send) or `soft` (allow but flag).
- `token_purchases` — purchase requests. Until a real payment provider is
  wired in, every request enters in `pending` and a super admin approves or
  rejects it. Approval atomically credits the wallet and records a
  `purchase` ledger entry. The model already stores `paymentProvider` /
  `paymentReference` so plugging in a real provider is additive.
- `monthly_send_usage` — denormalized per-tenant counters keyed by
  `YYYY-MM`. They are `$inc`'d on every debit/refund so send-limit checks
  stay O(1) without scanning the ledger.

### Sending pipeline

[`campaign.service.js`](../backend/src/modules/campaigns/campaign.service.js)
runs the preflight + dispatch with these guarantees:

1. **Plan** — `planRecipients` produces one record per contact × channel.
   Skipped contacts (missing/invalid addresses, blocked, archived,
   duplicates) are persisted with `status: 'skipped'` and never consume
   tokens or send-limit quota.
2. **Preflight** — `preflightCampaignSend` totals the per-channel cost,
   checks the live wallet balance, and checks the projected monthly usage
   against the tenant's limits. If a check fails, every pending recipient
   is flipped to `failed` with `failureReason: 'insufficient_balance'` or
   `'send_limit_exceeded'`, the campaign status becomes `failed`, and the
   service throws a `ConflictError` _before_ any provider call.
3. **Atomic debit** — for each pending recipient,
   `tokenService.debitForRecipient` runs a single `findOneAndUpdate` with
   `balance: { $gte: cost }`. If a concurrent send drained the wallet, the
   update returns `null`, the recipient is marked failed with
   `'insufficient_balance'`, and dispatch continues with the rest.
4. **Provider call** — only runs when the debit succeeded.
5. **Failure policy** — controlled by `TOKEN_FAILED_SEND_POLICY`:
   - `refund` (default): a `refund` ledger entry restores the cost.
   - `charge`: the debit stays.
   - `hold`: the debit stays and the campaign report surfaces the held
     amount for manual review.
6. **Summary** — the campaign summary stores `tokenCost`, `tokensCharged`,
   `tokensRefunded`, and `tokensHeld`. The `/campaigns/:id/report` payload
   adds `tokens.remainingBalance` so the UI can show the post-run balance
   without a second round-trip.

### API surface

Super admin (under `/api/v1/admin/`):

- `GET/POST/PUT /token-packages`, `PATCH /token-packages/:id/status`
- `GET/PUT /channel-pricing`
- `GET /tenants/:tenantId/token-wallet`
- `GET/PUT /tenants/:tenantId/send-limits`
- `POST /tenants/:tenantId/token-adjustments`
- `GET /token-purchases`, `POST /token-purchases/:id/approve|reject`

Client (under `/api/v1/billing/`, requires `billing.view`):

- `GET /tokens/balance` (wallet + pricing + limits + monthly usage)
- `GET /tokens/ledger`
- `GET /token-packages`
- `GET/POST /token-purchases`

### Audit trail

Every super-admin mutation calls `recordAuditEvent` with an action under the
`tokens.*` namespace (`tokens.package.created`, `tokens.adjustment.credit`,
`tokens.purchase.approved`, …). Campaign sends record `campaign.sent` with
token totals in `metadata`, so the existing audit log surfaces both
configuration changes and runtime spend.

### Configuration

The token economy is configured via these env vars (see
[`.env.example` defaults in `config/env.js`](../backend/src/config/env.js)):

```
TOKEN_PURCHASE_MODE=manual         # `manual` keeps purchases in pending state for super-admin approval
DEFAULT_TOKEN_BALANCE=0            # tokens granted when a tenant wallet is first created
DEFAULT_EMAIL_TOKEN_COST=1
DEFAULT_SMS_TOKEN_COST=2
DEFAULT_WHATSAPP_TOKEN_COST=3
TOKEN_FAILED_SEND_POLICY=refund    # refund | charge | hold
```

Tests under
[`backend/src/tests/tokens.spec.js`](../backend/src/tests/tokens.spec.js)
cover balance checks, atomic debits, skipped recipients, provider failures,
refunds, monthly send-limit enforcement, and admin-only configuration. The
existing campaign suite (`campaigns.spec.js`) keeps passing because the
default test wallet balance is intentionally high — token-specific behaviour
is asserted in the dedicated suite.

### Manual verification

1. `pnpm seed` to seed packages, channel pricing rules, a starter wallet,
   and a pending purchase request.
2. Sign in as the super admin and open `/app/admin/tokens` to configure
   packages, pricing, and the demo tenant's limits/adjustments.
3. Sign in as the demo client and open `/app/billing/tokens` to view the
   balance, request a package, and see the ledger.
4. Send a campaign to a mix of valid, missing-email, and `fail@example.com`
   contacts and inspect the report: skipped recipients consume no tokens,
   provider failures produce a refund ledger entry, and the remaining
   balance matches the wallet.
5. Set a tenant monthly cap of 1, queue 2 valid recipients, and send: the
   API responds with 409 and every pending recipient ends in `failed`
   without touching the wallet.
