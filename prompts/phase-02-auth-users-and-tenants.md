# Phase 02 - Auth, Users, and Tenants

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-01.

## Goal

Implement authentication, users, tenants, roles, refresh tokens, tenant isolation, and seeders for the super admin and demo client.

## Scope

Implement backend auth and tenant foundation only. Frontend login UI belongs to Phase 03.

## Tasks

- Create `User` and `Tenant` Mongoose models with indexes.
- Create refresh token persistence with hashed token storage, expiration, revocation, and user/session association.
- Implement registration for client accounts and automatic tenant creation.
- Implement login, logout, refresh, and `GET /api/v1/auth/me`.
- Implement password hashing and password verification.
- Implement JWT access tokens and refresh token rotation.
- Implement auth middleware that attaches authenticated user context.
- Implement role and permission middleware.
- Implement tenant isolation middleware or tenant context resolver.
- Implement super admin behavior with explicit global access.
- Implement idempotent seeders for super admin and demo client/tenant.
- Add audit log hooks or minimal audit service stubs for auth events if the full audit module is deferred.
- Add tests for registration, login, refresh, `/me`, and tenant isolation basics.
- Update API documentation in English.

## API Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/forgot-password` prepared with safe placeholder behavior.
- `POST /api/v1/auth/reset-password` prepared with safe placeholder behavior.

## Infrastructure Details Not To Miss

- Email must be globally unique.
- Registration creates a `client_admin` user and one tenant in one consistent flow.
- Do not return password hashes or refresh token hashes in API responses.
- Refresh tokens must be revocable.
- Logout must revoke the current refresh token when available.
- Use secure cookie support only if the architecture chooses cookie transport; otherwise document bearer token transport.
- Tenant context must be unavailable for unauthenticated protected routes.
- Super admins must not accidentally inherit a tenant filter unless intentionally impersonating.
- Forgot/reset password can be structurally prepared without sending real email.

## Verification

- Run backend tests.
- Run seeders twice to prove idempotency.
- Log in as seeded super admin.
- Log in as seeded demo client.
- Verify `/me` returns role and tenant context correctly.
- Verify a client cannot request another tenant's protected data through direct IDs in any implemented route.

## Definition of Done

- Super admin can log in.
- Demo client can log in.
- Access token and refresh token flows work.
- Tenant context is available to protected domain code.
- Seeder data is stable and idempotent.
