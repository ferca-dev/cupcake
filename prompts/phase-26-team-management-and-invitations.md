# Phase 26 - Team Management and Invitations

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-25.

## Goal

Add tenant-level team management so client admins can invite users, assign roles/permissions, disable access, remove members, and transfer ownership safely.

## Scope

Implement team membership and invitation lifecycle. Do not build enterprise SSO in this phase.

## Tasks

- Add tenant membership data model if users alone are not enough.
- Add invitation model with email, role, permissions, status, expiration, inviter, and tenant.
- Add invite, resend, revoke, accept, and expire invitation flows.
- Add team member listing, detail, role update, disable, reactivate, and remove flows.
- Add owner transfer flow with explicit confirmation and audit logs.
- Add backend permission checks for team management.
- Add plan-limit checks for maximum tenant users if plans exist.
- Add team management UI for client admins.
- Add super admin visibility into tenant members and invitations.
- Add notification emails for invite, revoked invite, accepted invite, disabled account, and ownership transfer.
- Add tests for invitation lifecycle, permission enforcement, tenant isolation, and owner transfer.
- Update team management documentation in English.

## Suggested API Endpoints

- `GET /api/v1/team/members`
- `GET /api/v1/team/members/:id`
- `PATCH /api/v1/team/members/:id/role`
- `PATCH /api/v1/team/members/:id/status`
- `DELETE /api/v1/team/members/:id`
- `POST /api/v1/team/invitations`
- `GET /api/v1/team/invitations`
- `POST /api/v1/team/invitations/:id/resend`
- `POST /api/v1/team/invitations/:id/revoke`
- `POST /api/v1/team/invitations/accept`
- `POST /api/v1/team/owner-transfer`

## Infrastructure Details Not To Miss

- Invitation tokens must be hashed at rest.
- Invitation acceptance must validate email, tenant, expiration, and status.
- A tenant must always retain at least one active admin/owner.
- Users must not escalate their own role.
- Removing or disabling a user must revoke refresh tokens.
- Team changes must be audited.
- User-facing strings must be i18n-ready.

## Verification

- Run backend and frontend tests.
- Invite a new user and accept the invite.
- Revoke an invite and verify it cannot be accepted.
- Disable a member and verify they cannot access protected tenant resources.
- Transfer ownership and verify the old owner no longer has owner-only privileges.
- Verify a client cannot access another tenant's members.

## Definition of Done

- Client admins can manage tenant members and invitations.
- Team permissions are enforced server-side.
- Ownership transfer is safe and audited.
- Team management works within tenant and plan limits.
