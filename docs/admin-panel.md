# Admin Panel

The admin panel is the super-admin-only surface used to manage tenants
(client workspaces), review platform metrics, and act on accounts that need
to be suspended or cancelled.

## Access model

- Only the `super_admin` role can reach any `/api/v1/admin/*` endpoint. The
  router mounts `authenticate` and `requireRole('super_admin')` once for the
  entire admin namespace, so client roles cannot escalate through URL
  guessing.
- Tenant-bound users (`client_admin`, `client_member`) receive a `403` from
  every admin API call.
- Admin routes on the frontend are gated by `meta.roles: ['super_admin']`.
  Non-super-admin sessions are redirected to `/forbidden`.
- Super admins see the **Admin panel** entry in the dashboard sidebar; other
  users do not see the link at all.

## Endpoints

| Method | Path                               | Purpose                                                          |
| ------ | ---------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/v1/admin/metrics`            | Global metrics powering the admin dashboard.                     |
| GET    | `/api/v1/admin/tenants`            | Paginated tenant list with filters and per-tenant user counts.   |
| POST   | `/api/v1/admin/tenants`            | Create a tenant, optionally provisioning the first client admin. |
| GET    | `/api/v1/admin/tenants/:id`        | Tenant detail including owner summary.                           |
| PUT    | `/api/v1/admin/tenants/:id`        | Update name, slug, plan, and settings.                           |
| PATCH  | `/api/v1/admin/tenants/:id/status` | Change tenant status with audit trail.                           |
| GET    | `/api/v1/admin/tenants/:id/users`  | List every user belonging to the tenant.                         |

### Tenant list query parameters

- `page` (default `1`), `limit` (default `25`, max `100`)
- `status` — one of `active`, `suspended`, `cancelled`
- `search` — case-insensitive substring match against `name` and `slug`
- `sort` — one of `createdAt`, `-createdAt`, `name`, `-name`, `status`,
  `-status`

### Create payload

```json
{
  "name": "Gamma Inc",
  "slug": "gamma-inc",
  "status": "active",
  "planId": null,
  "settings": {
    "timezone": "UTC",
    "locale": "en-US"
  },
  "admin": {
    "name": "Gamma Owner",
    "email": "owner@gamma.example",
    "password": "Replace-Me-123!"
  }
}
```

The `admin` block is optional. When provided, the API creates a
`client_admin` user inside the new tenant and sets it as `ownerUserId`. If
provisioning the admin fails (for example, the email is already in use)
the tenant is rolled back so the system never leaves a half-provisioned
workspace.

### Status change payload

```json
{ "status": "suspended", "reason": "late payment" }
```

`reason` is optional and stored in the audit log entry to keep
accountability for admin actions.

## Tenant status semantics

Tenant status changes cascade into the access surface so that the rules
are enforced server-side, not just in the UI:

| Status      | Login                                                  | Existing sessions                                                                                                          | User accounts                                                                  |
| ----------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `active`    | Allowed                                                | Continue working                                                                                                           | Stay as-is; previously `inactive` users restored to `active`.                  |
| `suspended` | Rejected with `Your workspace is not currently active` | All active refresh tokens revoked, the `authenticate` middleware rejects every access token while the tenant is suspended. | Users are not modified — restoring `active` brings them back online instantly. |
| `cancelled` | Rejected                                               | Refresh tokens revoked.                                                                                                    | All non-`inactive` users are deactivated.                                      |

The `authenticate` middleware reads the tenant's status on every
authenticated request, so a tenant can be suspended at any moment and the
effect propagates without waiting for the access token to expire.

## Audit logging

Every admin write produces an `audit_logs` entry under
`entityType: 'tenant'`:

| Action                        | When                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `admin.tenant.created`        | Tenant created from `POST /api/v1/admin/tenants`.                                                                     |
| `admin.tenant.updated`        | Editable fields changed by `PUT /api/v1/admin/tenants/:id`. The `changedKeys` field records which fields moved.       |
| `admin.tenant.status_changed` | Status transitions. Metadata includes `previousStatus`, `nextStatus`, `reason`, `affectedUsers`, and `revokedTokens`. |

Login attempts that fail because of tenant status are recorded as
`auth.login.failure` entries with `reason: 'tenant_status_<status>'`.

## Frontend surface

- `views/admin/AdminDashboardView.vue` — reuses the existing
  `features/dashboard/AdminDashboard.vue` panel to render global metrics
  fetched from the admin store, with a refresh action and a shortcut to
  the tenant list.
- `views/admin/TenantListView.vue` — paginated table with search and
  status filter, per-row "Open" action, and a CTA to create a tenant.
- `views/admin/TenantCreateView.vue` — provisioning form with an optional
  admin block.
- `views/admin/TenantDetailView.vue` — edit form, status actions
  (`activate`, `suspend`, `cancel client`), owner summary, and the list of
  every user inside the tenant.
- `stores/admin.store.js` — owns the tenants list, the selected tenant
  with its users, and the global metrics. It also patches the local
  cache when a status change succeeds so the list and detail views stay
  consistent without a roundtrip refresh.
- Navigation: the super admin sidebar gains an **Admin panel** group with
  a child link to **Clients**. Client roles never see this group.

## Verification checklist

- Backend: `pnpm test --filter @cupcake/backend -- --run admin.spec`
  covers permissions, status cascades, audit logging, and the
  `authenticate` middleware's tenant gate.
- Frontend: `pnpm test --filter @cupcake/frontend -- --run admin.store
guards` covers the store's loading/error paths and the role guard for
  super-admin-only routes.
- Manual: sign in as the seeded super admin (`SUPER_ADMIN_EMAIL`) and
  navigate to **Admin panel → Clients**. Create a tenant, change its
  status, and confirm that the demo client user is rejected when the
  workspace is suspended.

## Impersonation

Impersonation is intentionally out of scope for this phase. The dashboard
service supports an `x-impersonate-tenant` header so super admins can opt
into a tenant view from existing client endpoints when needed, but the
admin panel itself does not offer a full impersonation flow yet. If
introduced in a future phase, it must require the super admin role, emit
an audit log on every entry/exit, surface a persistent visual indicator
in the UI while active, and provide an obvious exit affordance.
