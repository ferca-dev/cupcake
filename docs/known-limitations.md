# Known Limitations

Cupcake completed its post-billing, reports, media, and layout hardening pass
(Phase 23) with a small set of intentionally deferred features. Each item
below is intentionally incomplete, returns a stable but non-pretending API
surface, and is tracked here so future work has an explicit starting point.

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

## Messaging provider follow-ups

- **Modules**: `EMAIL_PROVIDER`, `SMS_PROVIDER`, `WHATSAPP_PROVIDER` (env vars).
- **Status today**: real adapters for Twilio SMS, Twilio WhatsApp, and Twilio
  SendGrid email ship and are selected by environment variables. Provider
  initialisation fails fast at startup when a real provider is selected
  without the required credentials. Mock providers remain the default for
  local development and tests.
- **Deferred items**: signature verification for the public webhook routes
  (`/api/v1/webhooks/twilio/messages` and `/api/v1/webhooks/sendgrid/events`)
  is wired but disabled — the events update recipient documents but never
  validate `X-Twilio-Signature` or `X-Twilio-Email-Event-Webhook-Signature`.
  Production deployments must enable verification (and front the routes with
  HTTPS plus the public webhook host) before exposing them. The webhook
  secret env vars (`TWILIO_STATUS_CALLBACK_URL`,
  `TWILIO_SENDGRID_EVENT_WEBHOOK_SECRET`) exist for that work.
- **Workaround**: keep `*_PROVIDER=mock` in any environment where real
  delivery is not yet contracted.

## Real payments

- **Status**: implemented in Phase 24 via Mercado Pago Checkout Pro
  (one-time token-package purchases) and Mercado Pago Preapproval
  (recurring subscriptions). The manual approval flow under
  `TOKEN_PURCHASE_MODE=manual` is still available for tenants who do not
  pay online — it stays the path of least resistance for invoiced
  customers. See [mercado-pago.md](mercado-pago.md) for setup,
  configuration, webhook semantics, and verification steps.
- **Behaviour today**: with `PAYMENT_PROVIDER=mercadopago` configured,
  clients can buy token packages or subscribe to a recurring plan from
  `/app/billing/buy-tokens` and `/app/billing/subscriptions`. Tokens are
  credited through the existing Phase 19 ledger exactly once per
  Mercado Pago confirmation. With `PAYMENT_PROVIDER=mock` (the default),
  the flow stays self-contained for local dev and tests.

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

## Email verification for staged email changes

- **Surface**: `PUT /api/v1/settings/profile` accepts an email change but
  never overwrites `users.email` directly.
- **Behaviour today**: the requested address is stored in
  `users.pendingEmail`. No verification mail is sent. A super admin must
  promote `pendingEmail` to `email` in MongoDB once ownership is confirmed
  out of band.
- **Why deferred**: a real email-verification token flow shares
  infrastructure with the deferred password reset flow above.
- **Workaround**: keep using the original email until the reset/verification
  flow ships.

## Password-change session preservation

- **Surface**: `PUT /api/v1/settings/password`.
- **Behaviour today**: a successful password change revokes every active
  refresh token for the user, including the calling session. The user is
  signed out everywhere and must log in again with the new password.
- **Why deferred**: the service already accepts an `exemptRefreshTokenId`
  argument so a future request handler can preserve the current session, but
  the controller does not yet plumb the calling refresh-token id through.
- **Workaround**: expect a re-login prompt immediately after a password
  change. Other sessions are revoked, which is the intended security trade.

## Object storage rotation and orphan cleanup

- **Module**: `media`.
- **Behaviour today**: deleted `media_assets` documents are flipped to
  `status: 'deleted'` and the underlying object stays in the configured
  store. There is no background job that prunes deleted records or detects
  orphaned uploads that were never referenced. Signed URLs use a 15-minute
  expiry for S3 reads and are not rotated for long-lived public references.
- **Why deferred**: an asynchronous cleanup job needs a job runner and a
  retention policy decision that has not been signed off.
- **Workaround**: operators can manually delete object keys from the storage
  provider after the matching `media_assets` document has been
  `status: 'deleted'` for the agreed retention window.

## Soft-limit notifications

- **Module**: `tokens` / `tenant_send_limits.enforcement: 'soft'`.
- **Behaviour today**: a soft send-limit produces `limitWarnings` in the
  campaign response payload and the send proceeds. There is no email, push,
  or in-product notification that fires when a soft limit is crossed.
- **Why deferred**: cross-channel notification routing is part of a future
  billing/admin notifications phase.
- **Workaround**: monitor `limitWarnings` in the campaign report or the
  audit log entry for `campaign.sent`.
