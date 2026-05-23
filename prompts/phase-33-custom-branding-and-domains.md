# Phase 33 - Custom Branding and Domains

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-32.

## Goal

Allow tenants to customize public form branding and, when allowed by plan, serve public forms from verified custom domains.

## Scope

Implement branding and custom domain infrastructure. Do not implement complex website hosting beyond public form routing.

## Tasks

- Extend tenant branding settings for logo, colors, public form theme, favicon, and white-label options.
- Integrate branding with media storage for logos and assets.
- Apply branding to public forms and relevant email templates.
- Add plan gates for custom branding, white-labeling, and custom domains.
- Create custom domain model with hostname, tenant, status, verification token, DNS record, SSL mode, and timestamps.
- Add domain request, verification, activation, deactivation, and deletion flows.
- Add public form host resolution by custom domain.
- Add admin review/override tools for domains.
- Add documentation for DNS verification and SSL/platform setup.
- Add tests for branding application, domain verification, host resolution, tenant isolation, and plan gating.
- Update branding/domain documentation in English.

## Suggested API Endpoints

- `GET /api/v1/branding`
- `PUT /api/v1/branding`
- `GET /api/v1/domains`
- `POST /api/v1/domains`
- `POST /api/v1/domains/:id/verify`
- `PATCH /api/v1/domains/:id/status`
- `DELETE /api/v1/domains/:id`
- `GET /api/v1/admin/domains`
- `POST /api/v1/admin/domains/:id/verify`

## Infrastructure Details Not To Miss

- Validate hostnames and prevent reserved/internal domains.
- Domain verification must require DNS proof before activation.
- Public host routing must not leak surveys across tenants.
- SSL provisioning mode must be explicit.
- Branding must not break accessibility or contrast.
- White-label behavior must be plan-gated.

## Verification

- Run backend and frontend tests.
- Upload and apply tenant logo/colors.
- Verify public form branding reflects tenant settings.
- Add a custom domain and verify DNS token flow.
- Resolve a public form through a custom domain and verify tenant isolation.
- Disable custom domain feature by plan and verify UI/API blocking.

## Definition of Done

- Tenants can customize public form branding.
- Custom domains can be verified and routed safely.
- Branding/domain features are plan-gated and tenant-safe.
- DNS/SSL setup is documented in English.
