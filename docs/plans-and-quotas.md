# Plans, Feature Gates, and Quotas

Cupcake exposes a product packaging system that lets platform admins control
which features each tenant can use and how much usage they get per month or
overall. This document describes the data model, the backend enforcement
layer, the admin and tenant API surfaces, and the migration story.

## Concepts

- **Plan** — A reusable definition (`name`, `code`, `description`, `price`,
  `features`, `quotas`). Plans live in the `plans` collection and are managed
  by super admins. A plan has a status: `draft`, `active`, or `archived`.
- **Plan assignment** — A historical record stored in `plan_assignments`. Each
  time a tenant is assigned a plan a new row is created and the previous row
  is closed by setting `replacedAt`. Snapshots of the plan name, code,
  features, and quotas are stored on the assignment so plan deletions or
  edits never rewrite history.
- **Feature** — A boolean entitlement (`features.campaigns.sms`,
  `surveys.exports`, `team.invitations`, …). The complete list lives in
  [`plan.constants.js`](../backend/src/modules/plans/plan.constants.js).
- **Quota** — A numeric limit per tenant. Quotas can be `lifetime`
  (active surveys, contacts, custom templates, storage MB, seats) or
  `monthly` (responses, campaigns, exports, on-demand reports). `null` means
  unlimited.
- **Effective plan** — The plan that gating uses for a tenant. Resolved by
  the latest active assignment; if none exists the tenant falls back to the
  built-in *Unmanaged* plan, which grants every feature with no quotas. This
  fallback exists so pre-existing tenants are not gated until an admin
  intentionally moves them onto a plan.

## Data Model

### `plans`

```js
{
  name: String,
  code: String, // unique
  description: String | null,
  status: 'draft' | 'active' | 'archived',
  isDefault: Boolean,
  price: {
    amountMinor: Number,
    currency: String,         // ISO 4217
    intervalUnit: 'months' | 'years',
    intervalCount: Number,
  },
  features: { [featureKey]: Boolean },
  quotas:   { [quotaKey]:   Number | null },  // null = unlimited
  subscriptionPlanId: ObjectId | null,        // optional MP link
  sortOrder: Number,
  createdBy / updatedBy: ObjectId,
  createdAt / updatedAt / archivedAt: Date,
}
```

### `plan_assignments`

```js
{
  tenantId: ObjectId,
  planId: ObjectId | null,
  planCodeSnapshot: String,
  planNameSnapshot: String,
  featuresSnapshot: Object,
  quotasSnapshot: Object,
  assignedAt: Date,
  replacedAt: Date | null,
  assignedByUserId: ObjectId | null,
  reason: String | null,
  subscriptionId: ObjectId | null,
  source: 'admin' | 'subscription' | 'system',
}
```

A unique index on `tenantId + replacedAt:null` is enforced by the service
(`closeAssignment` always runs in the same flow as `createAssignment`).

### `quota_usage`

```js
{
  tenantId: ObjectId,
  key: String,                              // quota key
  period: 'monthly' | 'lifetime',
  periodKey: 'YYYY-MM' | 'lifetime',
  usage: Number,
  lastIncrementedAt: Date,
}
```

The compound unique index on `(tenantId, key, periodKey)` makes the
upsert + `$inc` atomic — concurrent requests cannot race past a cap.

## Backend Enforcement

The plan service exposes three primitives:

- `assertFeature({ tenantId, feature })` — throws `FeatureBlockedError`
  (HTTP 402, code `FEATURE_BLOCKED`).
- `assertQuota({ tenantId, quotaKey, requested = 1 })` — checks the live
  count (lifetime) or the current `quota_usage` row (monthly) against the
  plan's limit. Throws `QuotaExceededError` (HTTP 402, code `QUOTA_EXCEEDED`).
- `consumeMonthlyQuota({ tenantId, quotaKey, amount = 1 })` — atomically
  increments the counter; used after the action completes.

The errors carry machine-readable `details`:

```jsonc
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Quota 'responsesPerMonth' exceeded for the active plan",
    "details": [
      {
        "quota": "responsesPerMonth",
        "limit": 500,
        "usage": 500,
        "requested": 1,
        "planCode": "free",
        "planName": "Free"
      }
    ]
  }
}
```

### Integration points

| Module        | Action                            | Feature                              | Quota                       |
| ------------- | --------------------------------- | ------------------------------------ | --------------------------- |
| Surveys       | create / duplicate                | —                                    | `surveys`                   |
| Surveys       | publish / republish               | `surveys.publish`                    | —                           |
| Contacts      | create contact                    | —                                    | `contacts`                  |
| Team          | create invitation                 | `team.invitations`                   | `users`                     |
| Templates     | create tenant template            | `templates.custom`                   | `templates`                 |
| Media         | upload image                      | `media.upload`                       | `storageMb`                 |
| Campaigns     | create (per channel)              | `campaigns.email/sms/whatsapp`       | `campaignsPerMonth` (reserve) |
| Campaigns     | send (after dispatch)             | —                                    | `campaignsPerMonth` (consume) |
| Public form   | submit response                   | —                                    | `responsesPerMonth`         |
| Reports       | CSV/XLSX export                   | `surveys.exports`                    | `exportsPerMonth`           |

## API Surface

### Admin (`super_admin` only)

- `GET    /api/v1/admin/plans`
- `POST   /api/v1/admin/plans`
- `GET    /api/v1/admin/plans/:id`
- `PUT    /api/v1/admin/plans/:id`
- `PATCH  /api/v1/admin/plans/:id/status`
- `GET    /api/v1/admin/plans/catalogue` — feature + quota definitions used
  to drive the admin form.
- `POST   /api/v1/admin/tenants/:tenantId/plan` — assign or reset a plan.
- `GET    /api/v1/admin/tenants/:tenantId/plan` — effective plan for a tenant.
- `GET    /api/v1/admin/tenants/:tenantId/plan-history` — list assignments.
- `GET    /api/v1/admin/tenants/:tenantId/usage` — quotas joined with usage.

### Tenant (`billing.view` permission for navigation; the API requires only
an authenticated tenant context)

- `GET /api/v1/billing/plan` — current plan + assignment.
- `GET /api/v1/billing/usage` — quotas + usage.
- `GET /api/v1/billing/plans/available` — active plans the tenant can switch
  to.
- `GET /api/v1/billing/plans/catalogue` — feature/quota definitions for
  rendering upgrade prompts.

## Subscription Integration

When a Mercado Pago subscription transitions to `authorized` and the linked
`SubscriptionPlan` has a `Plan` referencing it via `subscriptionPlanId`, the
subscription service automatically calls `assignPlanToTenant` with
`source: 'subscription'`. This keeps token wallets and feature gates
synchronised after a successful renewal. The hook is best-effort — a
missing or archived plan never blocks webhook acknowledgement.

## Downgrades and Historical Data

Plan changes are non-destructive:

- Historical surveys, contacts, campaigns, and responses remain readable
  regardless of the new plan's quotas — the gates only block *new* writes
  (create / publish / submit).
- If a plan is archived after assignment, the snapshot stored on the active
  assignment continues to drive gating. The `/billing/plan` endpoint returns
  a status of `archived` so the UI can prompt the tenant to upgrade.
- Switching plans never deletes wallet balances, invitations, or media. Use
  the admin tenant status flow (`suspended` / `cancelled`) for that.

## Seeded Plans

`pnpm seed` provisions three plans (`free`, `pro`, `enterprise`) and assigns
the demo tenant to the `pro` plan so the dashboard, usage meters, and
upgrade prompts have realistic data during local development.

## Default Plan Behaviour

Tenants without an explicit plan assignment resolve to the built-in
`Unmanaged` plan (all features enabled, no quotas). This is intentional:

- Pre-Phase-27 tenants stay fully functional until an admin actively
  assigns a plan.
- Tests and seed flows that do not configure plans keep working without
  per-test fixture changes.

To enforce a free tier as the new-tenant default, create a `free` plan with
`isDefault: true` (the seeder does this automatically) — but newly created
tenants still inherit no assignment by default. Use the admin assignment
endpoint or the seeder to attach the desired plan.
