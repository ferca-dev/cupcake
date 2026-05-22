# Phase 18 - Final Post-Delivery Hardening

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-17.

## Goal

Run a final quality, security, UX, and delivery verification pass after the campaign delivery, Twilio provider, response-limit, settings, navigation, and responsive data grid work.

## Scope

This phase fixes integration gaps and regressions. Do not add major new product features.

## Tasks

- Run the full backend test suite.
- Run the full frontend test suite.
- Add missing regression tests for Twilio provider selection, campaign survey locking, response limits, account settings, sidenav state, sticky nav, and responsive data tables.
- Verify all `.env.example` files include the new Twilio, SendGrid, and public URL variables.
- Verify provider setup documentation is accurate and does not expose secrets.
- Verify mock providers still work without Twilio credentials.
- Verify real-provider mode fails fast with clear configuration errors when required env vars are missing.
- Verify response-limit settings are copied into published versions and enforced from those versions.
- Verify password changes revoke or rotate refresh tokens.
- Verify language preference persists and updates the frontend.
- Verify survey public-open actions use configured URLs and safe new-tab attributes.
- Verify table headers stay aligned while scrolling horizontally and vertically.
- Verify top nav, table headers, dropdowns, and modals have sane z-index behavior.
- Run responsive checks for mobile, tablet, desktop, and large desktop.
- Update README, API docs, provider docs, and `.context` in English if implementation details changed.
- Document remaining limitations clearly.

## Integration Scenarios

- Create a survey, publish it, create a campaign for it, and send through mock providers.
- Switch providers to Twilio/SendGrid test configuration or mocked real-provider tests and verify normalized statuses.
- Open a campaign recipient link and submit a response.
- Verify a second response is blocked when the survey is configured for `one_per_contact`.
- Verify `one_per_device` and `one_per_ip` modes block repeat submissions.
- Update profile, password, and language settings.
- Navigate the app with expanded and collapsed sidenav states.
- Inspect surveys, contacts, campaigns, responses, transactions, tenants, and templates tables with enough rows and columns to force both scroll directions.

## Infrastructure Details Not To Miss

- Do not leave feature-specific TODOs in provider, response-limit, or settings code paths.
- Do not hide failed provider setup behind mock fallback when a real provider was explicitly selected.
- Do not allow frontend-only response-limit enforcement.
- Do not break mobile layouts while improving large desktop behavior.
- Do not introduce duplicated table implementations if a shared component can support the behavior.

## Verification

- Full backend tests pass.
- Full frontend tests pass.
- Lint and formatting checks pass.
- Manual smoke tests pass for campaign delivery, public response limits, settings, navigation, and data tables.
- Documentation is current and in English.

## Definition of Done

- New Phase 15-17 behavior is covered by tests or documented manual verification.
- Twilio/SendGrid provider setup is safe, documented, and environment-driven.
- Response-limit enforcement is backend-authoritative.
- Settings, navigation, and responsive tables are stable across supported viewports.
- The project is ready for the next product planning cycle.
