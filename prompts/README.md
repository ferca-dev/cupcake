# Cupcake Phase Prompts

This folder splits the original `promt.md` master prompt into execution-ready phase prompts.

## How to use

1. Run phases in numeric order.
2. Before each phase, provide `prompts/00-shared-context.md` as required context.
3. Provide only the current phase prompt plus any relevant files already created by previous phases.
4. Do not start the next phase until the current phase Definition of Done is verified.
5. Keep source code, code comments, README files, API docs, inline docs, seed labels, and developer-facing documentation in English.

## Files

- `00-shared-context.md`: product, architecture, stack, quality, security, tenancy, data model, and execution rules shared by every phase.
- `phase-00-project-planning-and-repository-setup.md`: monorepo, tooling, local infrastructure, environment, and context setup.
- `phase-01-backend-foundation.md`: backend application base, database connection, security middleware, health checks, and test harness.
- `phase-02-auth-users-and-tenants.md`: authentication, users, tenants, roles, refresh tokens, and seeders.
- `phase-03-frontend-foundation.md`: Vue application base, routing, Pinia, auth UI, layouts, theme, and reusable UI components.
- `phase-04-surveys-backend.md`: surveys, schema validation, slugs, versioning, lifecycle actions, and tenant-safe APIs.
- `phase-05-builder-frontend-mvp.md`: visual builder MVP, field palette, canvas, inspector, draft persistence, and schema validation.
- `phase-06-public-form-renderer-and-responses.md`: public form rendering, submission validation, responses, and thank-you flow.
- `phase-07-conditional-logic-engine.md`: shared conditional logic engine, visibility rules, navigation rules, and validation behavior.
- `phase-08-contacts-and-groups.md`: contact directory, groups, filters, validation, and tenant-safe CRUD.
- `phase-09-campaigns-and-sending-adapters.md`: campaigns, recipients, mock channel providers, skipped recipient reporting, and send reports.
- `phase-10-dashboard-and-analytics.md`: client and super admin metrics, dashboard APIs, and frontend analytics views.
- `phase-11-templates.md`: system and tenant templates, template seeders, and create-survey-from-template flow.
- `phase-12-transactions-and-billing-history.md`: transaction model, API, demo data, and billing history UI.
- `phase-13-admin-panel.md`: super admin tenant management, global metrics, audit visibility, and guarded admin routes.
- `phase-14-hardening.md`: tests, security review, indexes, accessibility, responsive checks, docs, and production readiness.

## Execution rule

If a phase reveals that a previous phase missed infrastructure or a cross-cutting concern, fix the earlier foundation in the same branch before continuing. Do not work around missing architecture with duplicated code.
