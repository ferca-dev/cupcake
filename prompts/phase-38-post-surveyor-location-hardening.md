# Phase 38 - Post Surveyor and Location Hardening

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-37.

## Goal

Run a final verification pass for surveyor users, verified submissions, IP/geolocation capture, survey location settings, and fieldwork monitoring.

## Scope

This phase fixes integration gaps and regressions. Do not add major new product features.

## Tasks

- Run the full backend test suite.
- Run the full frontend test suite.
- Run lint and formatting checks.
- Add missing regression tests for surveyor role permissions, same-tenant survey visibility, verified response submission, mandatory geolocation, IP metadata, and monitoring permissions.
- Verify surveyor submissions bypass only public respondent restrictions, not tenant isolation or schema validation.
- Verify location settings are copied into published survey versions.
- Verify public respondents can submit according to survey location mode.
- Verify surveyors cannot submit without geolocation.
- Verify location data is protected in reports, exports, and monitoring APIs.
- Verify audit logs are created for surveyor management, response submission, and location data export/view.
- Verify frontend copy for location permission is clear and i18n-ready.
- Verify mobile device geolocation works in the surveyor flow.
- Update documentation in English if implementation details changed.

## Integration Scenarios

- Client admin creates a surveyor.
- Surveyor logs in and sees only same-tenant surveys.
- Surveyor submits a response with geolocation.
- Surveyor attempts submission without geolocation and is blocked.
- Public respondent submits a survey with optional location denied.
- Public respondent is blocked when survey location is required.
- Client admin views surveyor activity and map data.
- Unauthorized user attempts to view surveyor location data and is rejected.

## Infrastructure Details Not To Miss

- Do not store or expose location data beyond the required business purpose.
- Do not downgrade surveyor geolocation requirements through frontend-only checks.
- Do not let response-limit bypass for surveyors bypass survey status or tenant authorization.
- Do not expose exact coordinates in broad aggregate reports by default.

## Verification

- Full backend tests pass.
- Full frontend tests pass.
- Lint and formatting checks pass.
- Manual mobile smoke test passes for surveyor geolocation submission.
- Manual admin smoke test passes for surveyor activity monitoring.

## Definition of Done

- Surveyor role behavior is secure and tenant-safe.
- IP/geolocation response metadata is reliable and permission-protected.
- Surveyor geolocation is mandatory and enforced server-side.
- Fieldwork monitoring is useful, auditable, and privacy-aware.
