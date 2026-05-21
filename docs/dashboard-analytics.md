# Dashboard and Analytics

Phase 10 introduces the dashboard module: a tenant-safe analytics layer that
aggregates existing operational data (surveys, responses, campaigns, recipients,
audit logs) into the metrics shown on the client and super admin dashboards.

## Goals

- Reuse the data already produced by phases 04–09; no new collections.
- Keep aggregation queries inside a dedicated module so future caching or
  pre-computation layers can swap in without touching call sites.
- Enforce tenant isolation in the service layer — never rely on the controller
  alone — and explicitly allow super admin access only through a separate route.
- Return stable shapes filled with zeros for missing metrics so the frontend can
  render the empty state, the demo seeded state, and a large data state with
  the same component tree.
- Avoid leaking personally identifying information through summary endpoints
  (responses include survey/contact/campaign references and timestamps, never
  raw answers).

## REST Surface

All endpoints sit under `/api/v1` and require the `dashboard.view` permission
(or `admin.dashboard.view` for the global metrics route).

| Method | Path                                  | Audience                | Notes                                                                                              |
| ------ | ------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/dashboard/summary`                  | Client / super admin    | Tenant-scoped overview. Super admins without a tenant impersonation header receive the global view. |
| GET    | `/dashboard/surveys/:id`              | Client / super admin    | Per-survey response and channel metrics. Survey is loaded under the caller's tenant scope first.    |
| GET    | `/dashboard/channels`                 | Client / super admin    | Per-channel send/failure/skip aggregations.                                                         |
| GET    | `/dashboard/recent-activity?limit=N`  | Client / super admin    | Latest audit log entries (action, entity, timestamp).                                              |
| GET    | `/admin/metrics?limit=N`              | Super admin             | Global tenants, users, surveys, responses, campaigns, channels, and recent activity.                |

The `/dashboard/*` router uses `requireTenantContext({ allowSuperAdminGlobal: true })`
so super admins can either:

- Send `x-impersonate-tenant: <tenantId>` and receive a tenant-scoped payload
  (the response carries `scope: "tenant"`).
- Send no impersonation header and receive the global admin metrics with
  `scope: "global"` from the same endpoint, so a single frontend view can power
  both surfaces.

The `/admin/metrics` endpoint is gated by `admin.dashboard.view` (granted only
to `super_admin`). Tenant-bound users always receive `403` from it.

## Tenant Isolation

Every aggregation in `dashboard.service.js` accepts a `tenantId`. The helpers
funnel it through `toObjectId`/`tenantMatch` which:

- Convert the id to a real `ObjectId` (a malformed id throws a `ValidationError`
  before any query runs).
- Inject `tenantId: ObjectId` into every `$match` stage and `find()` filter.

The global admin metrics function (`getAdminMetrics`) explicitly omits the
`tenantId` filter — that is the only entry point allowed to read across
tenants, and the routes layer ensures only `super_admin` reaches it.

A client admin viewing `/dashboard/surveys/:id` for a survey that does not
belong to their tenant gets a `404` because the survey lookup applies
`tenantId` first.

## Aggregation Strategy

The dashboard runs analytical queries directly against the operational
collections. Key trade-offs:

- **Aggregation pipelines, not loops.** Channel/status counts come from a
  single `$group` per collection, so the cost scales with the number of
  recipients per tenant, not per record.
- **`Promise.all` fan-out.** The client summary issues multiple aggregations in
  parallel and joins the results in memory. This keeps the round-trip count
  low without requiring a denormalised projection.
- **Indexes already exist.** `tenantId + createdAt`, `tenantId + surveyId +
  createdAt`, and `tenantId + status` indexes on surveys, responses, and
  recipients support every dashboard query without additional indexes.
- **Bounded working sets.** The "best/low performing surveys" query pulls at
  most 200 candidate surveys per tenant before ranking — enough for any single
  client tier, with explicit limits that prevent runaway queries.
- **No N+1.** Latest responses fetch all referenced surveys in a single
  follow-up query keyed by `_id $in`.

`mongoose.set('sanitizeFilter', true)` is enabled globally for safety, so the
dashboard explicitly wraps trusted `$in` filters with `mongoose.trusted()` for
the `find()` queries that need them.

## Client Metrics Returned by `/dashboard/summary`

Stable shape — zero/empty when there is no data:

```json
{
  "scope": "tenant",
  "summary": {
    "surveys": { "total": 0, "active": 0, "byStatus": { "draft": 0, "published": 0, "paused": 0, "archived": 0 } },
    "responses": { "total": 0 },
    "campaigns": { "total": 0, "byStatus": {} },
    "contacts": { "total": 0, "groups": 0 },
    "channels": {
      "totals": {
        "email":    { "attempted": 0, "sent": 0, "failed": 0, "skipped": 0, "pending": 0 },
        "sms":      { "attempted": 0, "sent": 0, "failed": 0, "skipped": 0, "pending": 0 },
        "whatsapp": { "attempted": 0, "sent": 0, "failed": 0, "skipped": 0, "pending": 0 }
      },
      "skippedReasons": {}
    },
    "recentSurveys": [],
    "bestResponseSurveys": [],
    "lowResponseSurveys": [],
    "latestResponses": []
  }
}
```

`sent` here means recipients that reached at least the `sent` state — this
folds `delivered`, `opened`, and `clicked` into the same bucket so the
"successfully dispatched" number matches what the campaign service reports.

`responseRate` per survey is computed as `responses / recipients dispatched`.
A survey with no campaign sends returns `null` for the rate (rendered as `—`
in the UI) rather than a misleading 0%.

## Super Admin Metrics Returned by `/admin/metrics`

```json
{
  "metrics": {
    "clients": { "total": 0, "active": 0, "suspended": 0, "cancelled": 0, "inactive": 0, "byStatus": {...} },
    "users":   { "total": 0, "byRole": {} },
    "surveys": { "total": 0, "active": 0, "byStatus": {...} },
    "responses": { "total": 0 },
    "campaigns": { "total": 0, "byStatus": {} },
    "channels": [{ "channel": "email", "sent": 0, "failed": 0, "skipped": 0, "attempted": 0 }, ...],
    "recentTransactions": [],
    "recentTenants": [],
    "recentActivity": []
  }
}
```

`recentTransactions` is intentionally an empty array on this phase. The
transactions collection arrives in phase 12 and will fill the same key
without a frontend change.

## Frontend Integration

- `services/dashboard.service.js` — REST client wrapper.
- `stores/dashboard.store.js` — Pinia store holding `summary`, `channels`,
  `recentActivity`, `adminMetrics`, and `surveyStats`. Each `fetch*` action
  toggles its own loading flag so partial loads are possible.
- `features/dashboard/ClientDashboard.vue` — KPIs, channel table, recent
  surveys, best/low performing surveys, latest responses, and an activity feed.
- `features/dashboard/AdminDashboard.vue` — Global KPIs, recently created
  tenants, platform-wide channel table, and a placeholder card explaining that
  transactions will arrive in a later phase.
- `features/dashboard/SurveyStatsView.vue` — Dedicated view at
  `/app/surveys/:id/stats` for per-survey response/channel breakdowns.
- `features/dashboard/DashboardKpi.vue` / `DashboardKpiGrid.vue` — Reusable KPI
  primitives. New metrics drop into the grid without layout changes.
- `features/dashboard/DashboardChannelsTable.vue` /
  `DashboardActivityList.vue` — Shared tables reused by client, admin, and
  survey views.

Empty, loading, and error states are explicit:

- The view shows `AppLoader` only on the first paint (when `summary === null`).
- Subsequent refreshes keep the previous data on screen; failures surface via
  the dashboard alert with a retry button.
- Every table renders a localized "no data" message when its row array is
  empty.

## Testing

`backend/src/tests/dashboard.spec.js` covers:

- Tenant-scoped summary returns aggregated metrics across surveys, responses,
  campaigns, and channels.
- A fresh tenant gets the stable zero-filled shape (covers the empty-state
  contract).
- Two co-existing tenants get completely isolated metrics (responses, sends,
  failures).
- `/dashboard/channels` produces per-channel/status/skip-reason aggregations
  and exposes provider counts.
- `/dashboard/surveys/:id` returns full per-survey stats and refuses
  cross-tenant reads with 404.
- `/dashboard/recent-activity` only returns audit logs belonging to the
  caller's tenant.
- `/admin/metrics` returns global metrics for super admin and 403s tenant
  clients.
- `/dashboard/summary` falls back to the global scope for a super admin with
  no impersonation header and switches to tenant scope when the header is set.
- The legacy `/surveys/:id/stats` endpoint now returns the same shape (no more
  `placeholder: true`).

## Local Verification

```sh
pnpm --filter @cupcake/backend test
pnpm --filter @cupcake/backend seed
pnpm --filter @cupcake/backend dev      # in one shell
pnpm --filter @cupcake/frontend dev     # in another
```

- Log in as the demo client (`client@cupcake.local`) and confirm the
  dashboard shows the seeded survey, campaign, and channel totals.
- Log in as the super admin (`admin@cupcake.local`) and confirm the global
  metrics view renders without a tenant.
- Create a fresh tenant (register flow) and confirm every card renders the
  empty state without errors.
