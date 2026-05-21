# Known Limitations

Cupcake completed its hardening phase (Phase 14) with the explicit decision to
ship a small set of deferred features rather than hide them behind silent
fallbacks. Each item below is intentionally incomplete, returns a stable but
non-pretending API surface, and is tracked here so future work has an explicit
starting point.

If a future change implements one of these, remove the entry from this file in
the same pull request.

## Password reset by email

- **Endpoints**: `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`.
- **Behaviour today**:
  - `forgot-password` always responds `200` with `delivered: false`. It never
    reveals whether the email belongs to a real account and never sends an
    email. The attempt is captured in `audit_logs` as
    `auth.password_reset.requested`.
  - `reset-password` always responds `422` with `Password reset is temporarily
unavailable`. No password can be changed through this code path.
- **Why deferred**: a real reset-token store, single-use enforcement, expiry,
  and an email provider integration are all out of scope for the current
  release. Shipping a partial implementation would risk locking users out or
  exposing accounts.
- **Workaround**: a super admin can reset another user's password by editing
  the corresponding `users` document directly (e.g. setting a new
  `passwordHash` via `bcrypt` and clearing `lastLoginAt`). This is intentional
  break-glass access for the closed beta.

## Bulk contact import

- **Endpoints**: `POST /api/v1/contacts/import`, `GET /api/v1/contacts/imports/:id/report`.
- **Behaviour today**: the request endpoint accepts the payload, records an
  audit event, and responds `202` with a job whose status is
  `pending_implementation`. The report endpoint always returns the same empty
  report shape with `placeholder: true`. No CSV/XLSX is parsed and no contacts
  are created.
- **Why deferred**: a real import requires file upload handling, schema
  detection, duplicate resolution policy, and a background job runner. None of
  those infrastructures exist yet.
- **Workaround**: contacts can be created one by one through the UI or via
  `POST /api/v1/contacts`.

## Real messaging providers

- **Modules**: `EMAIL_PROVIDER`, `SMS_PROVIDER`, `WHATSAPP_PROVIDER` (env vars).
- **Behaviour today**: only the `mock` provider is wired. It logs the
  outbound message, marks recipients as `sent`, and never contacts a real
  upstream provider.
- **Why deferred**: real providers require contracts, credentials, and
  domain-specific compliance (DKIM/SPF/DMARC for email, sender registration
  for SMS, Meta business account for WhatsApp). The adapter contract in
  [docs/provider-architecture.md](provider-architecture.md) is already shaped
  so a real provider can be plugged in without touching the campaign service.
- **Workaround**: dev/test only; do not run a production send.

## Real payments

- **Module**: `transactions`.
- **Behaviour today**: the `transactions` collection records billing history.
  It is read-only from the API perspective: there is no checkout flow, no
  webhook ingestion, and no signed-provider integration. Seed data and admin
  CLI scripts are the only writers.
- **Why deferred**: a payment integration (Stripe, Mercado Pago, etc.)
  requires contractual onboarding and is out of scope.
- **Workaround**: super admins can insert transactions manually for invoicing
  records.

## In-product user management

- **Surface**: there is no UI yet for tenant admins to manage other users
  inside their workspace.
- **Behaviour today**: only the super admin "Create tenant" flow can provision
  a first admin. After that, additional users have to be created manually.
- **Why deferred**: a fully-featured user-management screen (invites, password
  resets, role changes, deactivation) depends on the email reset flow above
  and is intentionally batched with it.
- **Workaround**: super admins can create additional users by inserting them
  in MongoDB and assigning a `tenantId`.
