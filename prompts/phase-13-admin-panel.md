# Phase 13 - Admin Panel

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-12.

## Goal

Build a super admin panel for managing tenants/clients, reviewing global metrics, and performing safe administrative actions.

## Scope

Focus on tenant/client management and global visibility. Impersonation is optional and must be secure, explicit, and audited if implemented.

## Tasks

- Complete admin tenant APIs if not already complete.
- Create tenant list, detail, create, edit, and status update flows.
- Implement tenant suspension/cancellation behavior consistently.
- Add global metrics integration from Phase 10.
- Add recent activity/audit visibility if audit data is available.
- Create frontend admin service/store.
- Create `TenantListView`.
- Create `AdminDashboardView`.
- Add admin-only route guards and navigation.
- Add tests for permissions, tenant status changes, and global access.
- Update admin documentation in English.

## API Endpoints

- `GET /api/v1/admin/tenants`
- `POST /api/v1/admin/tenants`
- `GET /api/v1/admin/tenants/:id`
- `PUT /api/v1/admin/tenants/:id`
- `PATCH /api/v1/admin/tenants/:id/status`
- `GET /api/v1/admin/metrics`

## Infrastructure Details Not To Miss

- Admin endpoints must reject client roles.
- Tenant status changes must have clear effects on client login/access.
- Suspended tenants should not be able to perform business operations.
- Status changes should be audited.
- Admin views must not use client tenant-scoped endpoints accidentally.
- If impersonation is implemented, it must require super admin role, create audit logs, be visibly indicated in UI, and be easy to exit.

## Verification

- Run backend and frontend tests.
- Log in as super admin and manage tenants.
- Attempt admin access as demo client and verify rejection.
- Suspend a tenant and verify expected access restrictions.
- Verify global metrics still load for super admin.

## Definition of Done

- Super admins can view and manage tenants/clients.
- Client users cannot access admin APIs or views.
- Tenant status behavior is enforced server-side.
