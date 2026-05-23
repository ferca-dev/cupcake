# Phase 35 - Surveyor Role and Verified Response Access

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-34.

## Goal

Add a tenant-created `surveyor` user role for field staff who can only see surveys from their own company and can submit verified responses without public respondent restrictions.

## Scope

Implement role, permissions, survey visibility, authenticated surveyor response access, and team-management integration. Location enforcement belongs to Phase 36 and monitoring belongs to Phase 37.

## Tasks

- Add `surveyor` to roles and permission mappings.
- Add permissions for verified response submission and surveyor activity visibility.
- Allow client admins to create/invite users with the `surveyor` role.
- Restrict surveyor UI/API access to surveys in their own tenant.
- Add surveyor-facing survey list with only assigned or tenant-available surveys based on the chosen product rule.
- Add authenticated surveyor response route/flow separate from anonymous public respondent flow where needed.
- Mark surveyor responses with `respondentType: 'surveyor'` and `submittedByUserId`.
- Ensure surveyor submissions bypass public-only restrictions: anonymous response limit, public CAPTCHA, public device/IP limit, public submission token requirement, and anonymous-only rules.
- Ensure surveyor submissions still validate survey status, tenant isolation, schema, required fields, conditional logic, and explicit surveyor-applicable rules.
- Add audit logs for surveyor creation, role changes, login, and response submission.
- Add tests for surveyor creation, tenant survey visibility, verified response submission, and blocked access to management modules.
- Update team, auth, and response documentation in English.

## Suggested API Endpoints

- `GET /api/v1/surveyor/surveys`
- `GET /api/v1/surveyor/surveys/:id`
- `POST /api/v1/surveyor/surveys/:id/responses`
- `GET /api/v1/team/surveyors`
- `POST /api/v1/team/surveyors`

## Infrastructure Details Not To Miss

- Surveyors must never access surveys from another tenant.
- Surveyors must not receive admin, campaign, billing, token, contact, or template permissions by default.
- Verified surveyor submission must not be implemented as a fake anonymous public submission.
- Surveyor response metadata must be distinguishable in reports and exports.
- Role changes must revoke or refresh active sessions to avoid stale permissions.
- User-facing strings must be i18n-ready.

## Verification

- Run backend and frontend tests.
- Create a surveyor as a client admin.
- Log in as surveyor and verify only same-tenant surveys are visible.
- Submit a response as surveyor to a published same-tenant survey.
- Verify public response restrictions do not block the surveyor.
- Verify the surveyor cannot access contacts, campaigns, billing, admin, or surveys from another tenant.

## Definition of Done

- Client admins can create surveyor users.
- Surveyors can only view and answer same-tenant surveys.
- Surveyor responses are authenticated, verified, and distinguishable from public responses.
- Surveyor access is tenant-safe and permission-limited.
