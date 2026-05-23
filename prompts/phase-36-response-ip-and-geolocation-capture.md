# Phase 36 - Response IP and Geolocation Capture

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-35.

## Goal

Record IP and optional browser geolocation for survey responses, add survey-level location requirements, and enforce mandatory geolocation for surveyor submissions.

## Scope

Implement metadata capture, survey settings, public/surveyor UX, validation, and privacy-safe storage. Fieldwork monitoring dashboards are Phase 37.

## Tasks

- Extend survey settings with location capture configuration.
- Support location modes: optional, required for all respondents, required for surveyors, and disabled where legally necessary.
- Record server-observed IP metadata for responses.
- Store raw IP only when allowed by configuration; otherwise store a hashed IP and coarse metadata if available.
- Add browser geolocation request flow to public and surveyor response forms.
- Store latitude, longitude, accuracy, permission status, source, and captured timestamp when permission is granted.
- Block submission when survey geolocation is required and permission is denied, unavailable, stale, or below minimum accuracy.
- Always require valid geolocation for surveyor submissions.
- Add clear i18n-ready UX copy explaining why location is requested.
- Add backend validation to prevent clients from spoofing required location fields without sanity checks.
- Add metadata fields to response exports and reports behind appropriate permissions.
- Add tests for optional location, required location, denied permission, surveyor mandatory location, IP hashing, and tenant isolation.
- Update response metadata and privacy documentation in English.

## Suggested Survey Settings Shape

```js
{
  locationCapture: {
    mode: 'optional',
    requireForSurveyors: true,
    minimumAccuracyMeters: 100,
    allowIpFallback: true,
    storeRawIp: false,
    requiredMessage: 'Location is required to submit this survey.'
  }
}
```

Allowed modes:

- `disabled`
- `optional`
- `required`
- `required_for_surveyors`

## Infrastructure Details Not To Miss

- Browser geolocation is permission-based and may be unavailable; the UI must handle that clearly.
- Surveyor submissions must fail when geolocation is missing even if public respondents can submit without it.
- IP capture must respect proxy headers only when trusted proxy configuration is set.
- Geolocation coordinates are sensitive data and must be permission-protected.
- Do not continuously track users; capture location only at submission or explicit survey milestones.
- Location settings must be copied into published survey versions.

## Verification

- Run backend and frontend tests.
- Submit a public response with optional geolocation denied and verify IP metadata is stored.
- Submit a public response with geolocation granted and verify coordinates/accuracy are stored.
- Configure geolocation as required and verify denied permission blocks submission.
- Submit as surveyor without geolocation and verify submission is blocked.
- Submit as surveyor with geolocation and verify response metadata includes user and coordinates.

## Definition of Done

- Responses store IP/geolocation provenance metadata.
- Survey settings control location requirements.
- Surveyor submissions always require geolocation.
- Location data is validated, permission-protected, and documented.
