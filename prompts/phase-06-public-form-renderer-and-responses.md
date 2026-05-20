# Phase 06 - Public Form Renderer and Responses

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-05.

## Goal

Allow anonymous or token-linked respondents to open a published survey through a public slug, submit validated answers, and store responses against the exact published survey version.

## Scope

Implement public form APIs, response model, response validation, and public frontend rendering. Conditional logic can be limited until Phase 07, but the design must not block it.

## Tasks

- Create `Response` Mongoose model with indexes.
- Create public form backend routes and services.
- Implement `GET /api/v1/public/forms/:slug`.
- Implement `GET /api/v1/public/forms/:slug/token/:submissionToken`.
- Implement `POST /api/v1/public/forms/:slug/responses`.
- Validate survey status before returning/submitting.
- Validate answers against the published schema and `surveyVersionId`.
- Store technical metadata safely.
- Create `PublicFormView`.
- Create `PublicThankYouView` or equivalent thank-you state.
- Render supported field types from schema.
- Implement frontend required/type validation and clear error display.
- Submit responses to backend.
- Add tests for public lookup, response validation, paused/archived behavior, and version association.
- Update public API documentation in English.

## Infrastructure Details Not To Miss

- Public routes must not require authentication.
- Public routes must never expose draft schemas.
- Submissions must reference the current published version at the time of response.
- Paused surveys must display the configured paused message and reject submission.
- Archived and draft surveys must not accept responses.
- Anonymous responses must be allowed only when survey settings allow them.
- Token-linked responses must connect to campaign recipient data when available in later phases.
- Rate limit public form submissions.
- Do not store full IP data if `collectIp` is false.

## Verification

- Run backend and frontend tests.
- Publish a survey.
- Open it through `/f/:slug` or `/forms/:slug`.
- Submit a valid anonymous response.
- Attempt invalid required/type responses and verify errors.
- Pause the survey and verify submission is blocked.
- Verify stored response includes `surveyId`, `surveyVersionId`, `tenantId`, answers, and metadata.

## Definition of Done

- A published survey can be opened publicly by slug.
- A respondent without an account can submit a valid response.
- The response is stored with the correct published version.
- Public form UX handles success and validation errors clearly.
