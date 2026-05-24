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
- `phase-15-campaign-delivery-and-twilio-providers.md`: enforce campaign-to-survey delivery, add Twilio SMS/WhatsApp providers, and add Twilio SendGrid email provider.
- `phase-16-response-rules-and-account-settings.md`: add one-response limits by device or IP and create account/settings screens for profile, password, language, and preferences.
- `phase-17-navigation-and-responsive-data-grids.md`: add collapsible sidenav, sticky top nav, public survey open action, large-screen responsiveness, and fixed-header responsive tables.
- `phase-18-final-post-delivery-hardening.md`: final verification pass after Twilio delivery, response limits, settings, navigation, and responsive table work.
- `phase-19-token-wallet-send-limits-and-admin-pricing.md`: admin-configurable send limits, token wallet, channel token costs, purchase flow preparation, and tenant balance enforcement.
- `phase-20-survey-statistical-reports.md`: per-survey statistical reports with response, completion, channel, question, timing, drop-off, and quality metrics.
- `phase-21-media-storage-for-images.md`: image/media storage abstraction to avoid filling the app server, including validation, upload flows, and provider-ready storage.
- `phase-22-centered-fill-width-layout-system.md`: global layout rules so content is centered while using available width consistently across large and small screens.
- `phase-23-post-billing-reports-media-layout-hardening.md`: final verification pass for token billing, survey reports, media storage, and layout changes.
- `phase-24-mercado-pago-online-payments.md`: Mercado Pago online payments for token purchases, subscriptions, payment webhooks, reminders, receipts, and billing emails.
- `phase-25-post-mercado-pago-payment-hardening.md`: final verification pass for Mercado Pago payments, subscriptions, token crediting, webhooks, and payment emails.
- `phase-26-team-management-and-invitations.md`: tenant team management, invitations, user lifecycle, granular permissions, and owner transfer.
- `phase-27-plans-feature-gating-and-quotas.md`: plan definitions, feature gates, quota enforcement, upgrade prompts, and admin plan management.
- `phase-28-consent-unsubscribe-and-suppression.md`: channel consent, unsubscribe/STOP flows, suppression lists, and compliant campaign filtering.
- `phase-29-background-jobs-queues-and-scheduling.md`: workers, queues, retries, scheduled jobs, dead-letter handling, and async processing.
- `phase-30-contact-import-export-system.md`: real CSV/XLSX contact import, column mapping, validation reports, deduplication, and exports.
- `phase-31-public-form-anti-abuse.md`: CAPTCHA/Turnstile-ready protection, honeypots, public rate limits, and suspicious submission controls.
- `phase-32-client-api-keys-and-webhooks.md`: tenant API keys, scoped API access, outbound webhooks, delivery logs, retries, and signing.
- `phase-33-custom-branding-and-domains.md`: tenant branding, white-label options, custom public form domains, DNS verification, and SSL readiness.
- `phase-34-production-readiness-observability-and-backups.md`: observability, backups, monitoring, incident readiness, operational runbooks, and production launch checks.
- `phase-35-surveyor-role-and-verified-response-access.md`: tenant-created surveyor users, restricted survey visibility, and verified response submission without public restrictions.
- `phase-36-response-ip-and-geolocation-capture.md`: response IP/geolocation metadata, survey-level location requirements, consent UX, and validation.
- `phase-37-surveyor-fieldwork-monitoring.md`: mandatory surveyor location, surveyor response tracking, fieldwork monitoring, maps, and supervisor reports.
- `phase-38-post-surveyor-location-hardening.md`: final verification for surveyor permissions, location enforcement, privacy, reporting, and regression coverage.

Implemented documentation for Phase 37 monitoring lives in
`docs/fieldwork-monitoring.md`.

## Execution rule

If a phase reveals that a previous phase missed infrastructure or a cross-cutting concern, fix the earlier foundation in the same branch before continuing. Do not work around missing architecture with duplicated code.
