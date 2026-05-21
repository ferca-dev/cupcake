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
