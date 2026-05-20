# Phase 04 - Surveys Backend

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-03.

## Goal

Implement tenant-safe survey CRUD, schema validation, public slug handling, survey lifecycle actions, and immutable published versions.

## Scope

Backend only. Builder UI and public rendering are later phases.

## Tasks

- Create `Survey` and `SurveyVersion` Mongoose models with required indexes.
- Implement survey repository, service, controller, routes, and validation.
- Implement schema validator for the form schema.
- Implement slug normalization and uniqueness service.
- Implement tenant-scoped survey list/detail/create/update/delete.
- Implement lifecycle actions: publish, pause, archive, duplicate.
- Implement version creation during publish.
- Prevent destructive mutation of published versions.
- Add audit logging for survey creation, update, publish, pause, archive, and duplicate when audit infrastructure exists.
- Add tests for schema validation, slug generation, tenant filtering, publish/version behavior, and lifecycle rules.
- Update API documentation in English.

## API Endpoints

- `GET /api/v1/surveys`
- `POST /api/v1/surveys`
- `GET /api/v1/surveys/:id`
- `PUT /api/v1/surveys/:id`
- `DELETE /api/v1/surveys/:id`
- `POST /api/v1/surveys/:id/duplicate`
- `POST /api/v1/surveys/:id/publish`
- `POST /api/v1/surveys/:id/pause`
- `POST /api/v1/surveys/:id/archive`
- `GET /api/v1/surveys/:id/versions`
- `GET /api/v1/surveys/:id/stats` prepared with minimal counts or documented placeholder.

## Infrastructure Details Not To Miss

- Every survey query for client users must include `tenantId`.
- Slug uniqueness must be enforced by both validation and a MongoDB unique index.
- Publishing must copy the draft schema into a new immutable version.
- Responses in later phases must be able to reference `surveyVersionId`.
- Draft surveys must not be public.
- Archived surveys must not accept destructive changes.
- Paused surveys keep their URL but later public submission must be blocked.
- Duplicate creates a new `draft` survey with a unique slug.
- Schema validation must catch duplicate field keys, invalid field types, invalid options, and malformed logic rules where possible.

## Verification

- Run backend tests.
- Create a draft survey through the API.
- Update the draft survey.
- Publish the survey and verify a version record was created.
- Attempt duplicate slugs and verify clear validation errors.
- Verify client tenant isolation.

## Definition of Done

- Clients can create, read, update, and list their own surveys.
- Publishing creates immutable survey versions.
- Slugs are normalized and unique.
- Lifecycle actions behave consistently.
