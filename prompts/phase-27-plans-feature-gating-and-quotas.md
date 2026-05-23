# Phase 27 - Plans, Feature Gating, and Quotas

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-26.

## Goal

Implement configurable plans, feature gates, and quotas so admins can control product packaging and clients receive clear upgrade paths.

## Scope

Build plan enforcement and UX around limits. Payment collection may reuse Mercado Pago from earlier phases but does not need new payment products.

## Tasks

- Create plan model with features, quotas, price metadata, and status.
- Add tenant plan assignment and plan history.
- Add admin UI/API for creating, editing, activating, archiving, and assigning plans.
- Add backend feature-gate middleware/helper.
- Add quota usage tracking for users, surveys, responses, contacts, campaigns, tokens, storage, templates, exports, custom branding, and reports where applicable.
- Add client-visible plan summary and usage meters.
- Add upgrade prompts for blocked features or exhausted quotas.
- Integrate plan changes with subscriptions where applicable.
- Add downgrade behavior rules and read-only handling for existing data.
- Add tests for feature gates, quota enforcement, tenant isolation, and plan changes.
- Update plan and quota documentation in English.

## Suggested API Endpoints

- `GET /api/v1/admin/plans`
- `POST /api/v1/admin/plans`
- `PUT /api/v1/admin/plans/:id`
- `PATCH /api/v1/admin/plans/:id/status`
- `POST /api/v1/admin/tenants/:tenantId/plan`
- `GET /api/v1/billing/plan`
- `GET /api/v1/billing/usage`

## Infrastructure Details Not To Miss

- Backend APIs must enforce plan limits even if the UI hides features.
- Usage counters must be accurate enough for billing and quota decisions.
- Quota checks must be race-safe for high-volume operations.
- Downgrades must not silently delete customer data.
- Plan definitions must be audited.
- Feature gate errors should return machine-readable codes for UI upgrade prompts.

## Verification

- Run backend and frontend tests.
- Create a plan with low limits and assign it to a tenant.
- Verify blocked features are rejected by backend and shown clearly in UI.
- Exhaust a quota and verify further creation is blocked.
- Upgrade the tenant and verify the feature/limit becomes available.
- Downgrade the tenant and verify existing data remains readable.

## Definition of Done

- Admins can configure and assign plans.
- Backend feature gates and quotas are enforced.
- Clients can see plan usage and upgrade prompts.
- Plan changes are audited and subscription-ready.
