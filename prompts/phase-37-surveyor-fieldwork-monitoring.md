# Phase 37 - Surveyor Fieldwork Monitoring

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-36.

## Goal

Add fieldwork monitoring for surveyor users so client admins can supervise surveyor activity, submitted surveys, response locations, and productivity.

## Scope

Implement monitoring from submitted response events and captured geolocation. Do not add continuous GPS tracking.

## Tasks

- Add surveyor activity aggregation service.
- Add activity records or derive activity from authenticated surveyor responses.
- Add supervisor/admin dashboard for surveyor performance.
- Show response counts by surveyor, survey, date, location availability, and completion status.
- Add map-ready response location data for authorized users.
- Add filters by surveyor, survey, date range, survey version, campaign, and location status.
- Add suspicious activity indicators such as missing location, low accuracy, repeated same location, impossible travel speed if practical, and unusual submission bursts.
- Add CSV/XLSX export for surveyor activity.
- Add permissions so only client admins or authorized supervisors can view surveyor monitoring data.
- Add audit logs for viewing/exporting surveyor location data.
- Add tests for aggregation, permissions, tenant isolation, map data, and export behavior.
- Update fieldwork monitoring documentation in English.

## Suggested API Endpoints

- `GET /api/v1/surveyor-activity/summary`
- `GET /api/v1/surveyor-activity/responses`
- `GET /api/v1/surveyor-activity/map`
- `GET /api/v1/surveyor-activity/export`
- `GET /api/v1/surveyor-activity/surveyors/:userId`

## Infrastructure Details Not To Miss

- Location monitoring data is sensitive and must be permission-checked.
- Do not expose surveyor location to other surveyors.
- Do not show exact coordinates to roles that only need aggregate productivity metrics.
- Map endpoints must be tenant-scoped.
- Export must include an audit event.
- Large activity exports should run through the job/export system if available.

## Verification

- Run backend and frontend tests.
- Submit multiple surveyor responses with location.
- View activity dashboard as client admin.
- Verify a surveyor cannot view another surveyor's activity.
- Filter by date, survey, and surveyor.
- Export activity and verify tenant-safe data.
- Verify missing/low-accuracy location indicators appear when applicable.

## Definition of Done

- Client admins can monitor surveyor work from verified submissions.
- Surveyor location data is visible only to authorized roles.
- Activity reports are tenant-safe, filterable, and exportable.
- Monitoring is based on submission events, not continuous tracking.
