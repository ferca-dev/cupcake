# Phase 30 - Contact Import and Export System

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-29.

## Goal

Replace placeholder contact import with a real CSV/XLSX import workflow and add reliable contact/response export capabilities.

## Scope

Implement import/export for contacts first and response exports where current response/report models allow it.

## Tasks

- Implement upload flow for CSV and XLSX contact imports.
- Add import job model with status, counts, file metadata, mapping, and error report.
- Add preview step that detects headers and sample rows.
- Add column mapping UI.
- Validate rows for email, phone, WhatsApp, name, tags, groups, metadata, status, and consent fields.
- Deduplicate by configured keys.
- Preserve suppression and consent state.
- Allow user to confirm import after preview.
- Generate downloadable error report for rejected rows.
- Add contact export in CSV/XLSX.
- Add response export in CSV/XLSX if responses are ready.
- Run large imports/exports through background jobs.
- Add tests for parsing, mapping, validation, deduplication, error reports, tenant isolation, and export permissions.
- Update import/export documentation in English.

## Suggested API Endpoints

- `POST /api/v1/contacts/imports`
- `GET /api/v1/contacts/imports/:id`
- `POST /api/v1/contacts/imports/:id/preview`
- `PUT /api/v1/contacts/imports/:id/mapping`
- `POST /api/v1/contacts/imports/:id/confirm`
- `GET /api/v1/contacts/imports/:id/errors`
- `GET /api/v1/contacts/export`
- `GET /api/v1/surveys/:surveyId/responses/export`

## Infrastructure Details Not To Miss

- Do not block the request thread for large files.
- Validate file size and type.
- Keep uploaded import files out of Git and permanent local disk for production.
- Import errors must be row-specific.
- Do not create cross-tenant group associations from import data.
- Exports must not include unauthorized personal data.

## Verification

- Run backend and frontend tests.
- Import a CSV with valid, invalid, duplicate, and suppressed contacts.
- Import an XLSX with mapped columns.
- Download an error report and verify row-level details.
- Export contacts and verify filters/tenant isolation.
- Export survey responses and verify schema/version labels.

## Definition of Done

- Contact import supports CSV/XLSX preview, mapping, validation, deduplication, and error reports.
- Contact and response exports are permission-safe.
- Large import/export jobs run asynchronously.
