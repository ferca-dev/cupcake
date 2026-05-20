# Phase 11 - Templates

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-10.

## Goal

Implement reusable survey templates, system templates, tenant templates, seed templates, and the flow to create surveys from templates.

## Scope

Do not build a full template marketplace. Keep template management practical and tenant-safe.

## Tasks

- Create `Template` Mongoose model with indexes.
- Implement template CRUD APIs with permissions.
- Implement template listing for clients: active system templates plus active tenant templates.
- Implement super admin management for system templates.
- Implement create-survey-from-template flow.
- Ensure template schema is duplicated into the new survey, not referenced.
- Add seeders for at least three system templates.
- Create frontend template service/store.
- Create `TemplateListView`.
- Add UI to start a new survey from a template.
- Add tests for visibility, tenant isolation, schema duplication, and permissions.
- Update template documentation in English.

## API Endpoints

- `GET /api/v1/templates`
- `POST /api/v1/templates`
- `GET /api/v1/templates/:id`
- `PUT /api/v1/templates/:id`
- `DELETE /api/v1/templates/:id`
- `POST /api/v1/templates/:id/create-survey`

## Initial Template Suggestions

- Customer satisfaction survey.
- Employee feedback survey.
- Event registration form.
- Product feedback survey.
- NPS survey.
- Contact information form.
- Post-service feedback.
- Lead capture form.

## Infrastructure Details Not To Miss

- `tenantId: null` means system template.
- Tenant templates must not be visible across tenants.
- Creating a survey from a template must produce a normal `draft` survey.
- Template schema must pass the same validation as survey schemas.
- Archived/inactive templates must not be used for new surveys.
- Permissions must distinguish system template management from tenant template management.

## Verification

- Run backend and frontend tests.
- Run seeders and verify system templates exist.
- Log in as demo client and create a survey from a system template.
- Confirm editing the new survey does not mutate the template.
- Verify tenant templates are tenant-scoped.

## Definition of Done

- Clients can start surveys from templates.
- Super admins can manage system templates.
- Template schemas are validated and duplicated safely.
