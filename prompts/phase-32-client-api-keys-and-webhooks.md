# Phase 32 - Client API Keys and Outbound Webhooks

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-31.

## Goal

Add tenant-scoped API keys and outbound webhooks so clients can integrate Cupcake with external systems.

## Scope

Implement API key management, scoped API authentication, webhook configuration, signing, retries, and logs. Do not build a full developer marketplace.

## Tasks

- Create API key model with hashed key, prefix, scopes, tenant, owner, status, last used, and expiration.
- Add API key creation, listing, rotation, revoke, and delete flows.
- Add API key authentication middleware.
- Define initial scopes for surveys, responses, contacts, campaigns, and reports.
- Add outbound webhook endpoint configuration model.
- Add webhook event types for response submitted, campaign completed, campaign failed, payment approved, low token balance, and subscription failed.
- Sign outbound webhook payloads.
- Add retry policy and delivery log.
- Add client UI for API keys and webhook endpoints.
- Add tests for scoped access, key hashing, webhook signing, retry behavior, tenant isolation, and delivery logs.
- Update developer documentation in English.

## Suggested API Endpoints

- `GET /api/v1/developer/api-keys`
- `POST /api/v1/developer/api-keys`
- `POST /api/v1/developer/api-keys/:id/rotate`
- `DELETE /api/v1/developer/api-keys/:id`
- `GET /api/v1/developer/webhooks`
- `POST /api/v1/developer/webhooks`
- `PUT /api/v1/developer/webhooks/:id`
- `DELETE /api/v1/developer/webhooks/:id`
- `GET /api/v1/developer/webhooks/:id/deliveries`
- `POST /api/v1/developer/webhooks/:id/test`

## Infrastructure Details Not To Miss

- Store only hashed API keys.
- Show the raw API key only once on creation/rotation.
- API keys must never grant super admin access.
- Webhook secrets must be generated securely.
- Webhook payloads must include event ID, timestamp, tenant-safe data, and signature.
- Webhook retries must be asynchronous and idempotent.
- Delivery logs must redact sensitive headers.

## Verification

- Run backend and frontend tests.
- Create an API key and call a scoped endpoint.
- Attempt a disallowed scope and verify rejection.
- Rotate/revoke a key and verify old key fails.
- Configure a webhook endpoint and send a test event.
- Verify signature and retry logs.

## Definition of Done

- Tenants can manage scoped API keys.
- API key authentication is secure and tenant-safe.
- Outbound webhooks are signed, retried, and logged.
- Developer-facing setup is documented in English.
