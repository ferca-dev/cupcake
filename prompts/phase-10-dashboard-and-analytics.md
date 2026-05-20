# Phase 10 - Dashboard and Analytics

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-09.

## Goal

Implement useful dashboard metrics for clients and super admins, including survey performance, response rates, channel metrics, failures, recent activity, and global platform metrics.

## Scope

Build analytics from existing operational data. Do not introduce external analytics infrastructure unless clearly needed.

## Tasks

- Implement dashboard query services with tenant-safe aggregation.
- Create client dashboard summary endpoint.
- Create survey-specific stats endpoint or complete existing placeholder.
- Create channel metrics endpoint.
- Create recent activity endpoint using audit logs or domain events available so far.
- Create super admin metrics endpoint.
- Add indexes or aggregation optimizations needed by dashboard queries.
- Create frontend dashboard store/service.
- Build client dashboard cards and tables.
- Build survey-level stats UI.
- Build super admin dashboard metrics view.
- Add empty, loading, and error states.
- Add tests for aggregations, tenant isolation, and super admin global access.
- Update analytics documentation in English.

## API Endpoints

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/surveys/:id`
- `GET /api/v1/dashboard/channels`
- `GET /api/v1/dashboard/recent-activity`
- `GET /api/v1/admin/metrics`

## Client Metrics

- Total surveys.
- Active surveys.
- Total responses.
- Response rate by survey.
- Sends by channel.
- Send failures by channel.
- Recent surveys.
- Best response forms.
- Low response forms.
- Latest responses.

## Super Admin Metrics

- Total clients.
- Active/inactive clients.
- Total platform surveys.
- Total platform responses.
- Total sends by channel.
- Recent transactions/payments.
- Recent activity.

## Infrastructure Details Not To Miss

- Client metrics must only include the requesting tenant.
- Super admin metrics must explicitly bypass tenant scoping through authorized global services.
- Avoid N+1 queries in dashboard endpoints.
- Return stable shapes with zeros for missing metrics.
- Keep date/time handling timezone-aware where possible.
- Do not expose personally sensitive response details in summary endpoints.
- Dashboard UI must remain usable with no data, demo data, and large-ish demo data.

## Verification

- Run backend and frontend tests.
- Seed demo data.
- Log in as demo client and verify tenant-scoped metrics.
- Log in as super admin and verify global metrics.
- Compare response and campaign counts against database records.
- Verify empty state behavior with a new tenant.

## Definition of Done

- Client dashboard shows segmented survey and channel metrics.
- Super admin dashboard shows global metrics.
- Aggregations are tenant-safe and tested.
