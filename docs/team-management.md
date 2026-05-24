# Team Management

Phase 26 introduces tenant-level team management. Workspace admins (`client_admin`) can invite users, assign roles, disable accounts, remove members, and hand off ownership without contacting the super admin.

## Capabilities

- Invite by email + role (`client_admin`, `client_member`, `surveyor`).
- Create active surveyor accounts directly for field staff.
- Resend or revoke pending invitations.
- Public, token-based invitation acceptance flow.
- Update a member's role or status (active / inactive / suspended).
- Remove members (deletes the user, revokes all refresh tokens).
- Transfer ownership to another active admin. The previous owner remains an admin.
- Super admin visibility into a tenant's members **and** invitations from the admin panel.

## Data Model

### `TeamInvitation`

| Field                                                      | Notes                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `tenantId`                                                 | Owning workspace.                                                                                                              |
| `email`, `name`, `role`                                    | Invitee. Role limited to `client_admin`, `client_member`, `surveyor`.                                                          |
| `tokenHash`                                                | SHA-256 of the opaque acceptance token. Plaintext is sent in the email and returned **once** from the create/resend endpoints. |
| `status`                                                   | `pending`, `accepted`, `revoked`, `expired`.                                                                                   |
| `expiresAt`                                                | 7 days from creation/resend.                                                                                                   |
| `invitedByUserId` / `revokedByUserId` / `acceptedByUserId` | Audit trail.                                                                                                                   |
| `lastSentAt`, `resendCount`                                | Track delivery activity.                                                                                                       |

Indexes:

- Unique `(tenantId, email)` for **pending** invitations only — accepted/revoked rows are preserved for audit.
- `tokenHash` for lookup at accept time.
- `(tenantId, status, createdAt)` for tenant listings.

### `Tenant.settings.maxTeamMembers`

Optional integer that caps the total of active members + pending invitations. `null` = unlimited. Super admins set this from the tenant detail page until plan-driven quotas land.

## API Endpoints

All routes are under `/api/v1/team` and require authentication except `/invitations/accept`.

| Method | Path                             | Permission     | Notes                                                                                                                        |
| ------ | -------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/team/members`                  | `users.manage` | Paginated members, includes `isOwner`, current seat limit.                                                                   |
| GET    | `/team/members/:id`              | `users.manage` | Member detail.                                                                                                               |
| GET    | `/team/surveyors`                | `users.manage` | Paginated tenant surveyors.                                                                                                  |
| POST   | `/team/surveyors`                | `users.manage` | Creates an active `surveyor` user with `{ name, email, password }`.                                                          |
| PATCH  | `/team/members/:id/role`         | `users.manage` | Cannot change own role; cannot demote the workspace owner; refuses if it would leave zero active admins.                     |
| PATCH  | `/team/members/:id/status`       | `users.manage` | Disabling revokes refresh tokens. Cannot disable the owner.                                                                  |
| DELETE | `/team/members/:id`              | `users.manage` | Same admin-floor checks as PATCH.                                                                                            |
| GET    | `/team/invitations`              | `users.manage` | Paginated invitations.                                                                                                       |
| POST   | `/team/invitations`              | `users.manage` | Returns `{ invitation, acceptToken, acceptUrl }`. The plaintext token is shown once.                                         |
| POST   | `/team/invitations/:id/resend`   | `users.manage` | Rotates the token, extends expiration.                                                                                       |
| POST   | `/team/invitations/:id/revoke`   | `users.manage` | Marks `revoked`; the token can no longer accept.                                                                             |
| POST   | `/team/invitations/accept`       | public         | Body `{ token, name?, password }`. Auto-expires the invitation row when the token is expired before failing.                 |
| POST   | `/team/owner-transfer`           | `users.manage` | Body `{ targetUserId, confirm: true }`. Only the current owner or a super admin may call. Auto-promotes the target to admin. |
| GET    | `/admin/tenants/:id/invitations` | `super_admin`  | Super-admin-only listing for support.                                                                                        |

### Acceptance flow

1. Admin calls `POST /team/invitations`. The backend emails the invitee with `acceptUrl` and returns the same URL once for the admin UI.
2. Invitee opens the link → `/auth/accept-invitation?token=...` (frontend route). The page POSTs `{ token, name?, password }` to `/team/invitations/accept`.
3. Backend re-validates expiration, seat limit, and tenant status, hashes the password, links/creates the `User` row, and marks the invitation `accepted`.
4. Frontend auto-logs the new user in and routes to the dashboard.

## Safety Rules

- Invitation acceptance tokens are stored hashed (`hashTokenValue`); the plaintext lives only in the invitee's email and is shown once in the API response.
- A tenant must always retain at least one active `client_admin`. The service refuses role demotions, removals, and disabling operations that would leave zero.
- Users cannot change their own role or status.
- Removing or disabling a member revokes every active refresh token for that user.
- Changing a member's role revokes every active refresh token for that user so stale permissions expire on the next refresh.
- Ownership transfer requires `confirm: true` and is restricted to the current owner (or super admin). The target is promoted to admin if needed.
- Email notifications go through the existing `transactional-email` provider. Failures are logged but do not block the underlying mutation.

## Audit Trail

The service emits the following audit actions on the shared `AuditLog` collection:

- `team.invitation.created`, `team.invitation.resent`, `team.invitation.revoked`, `team.invitation.accepted`, `team.invitation.expired`
- `team.surveyor.created`, `team.member.role_changed`, `team.member.status_changed`, `team.member.removed`
- `tenant.ownership.transferred`

Each entry records the actor, tenant, entity id, and relevant metadata (previous/next values, revoked token counts, reason where applicable).

## Frontend

- `frontend/src/views/team/TeamManagementView.vue` — workspace team page (route `/app/team`, permission `users.manage`).
- `frontend/src/views/auth/AcceptInvitationView.vue` — unauthenticated acceptance route (`/auth/accept-invitation`).
- `frontend/src/stores/team.store.js` — Pinia store fronting the service.
- `frontend/src/services/team.service.js` — thin wrapper over `/api/v1/team/*`.
- Admin panel: `TenantDetailView` shows the tenant's invitations alongside its users.

All user-facing copy is i18n-ready under the `team.*` namespace in both `en.js` and `es.js`.
