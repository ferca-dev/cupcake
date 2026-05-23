# Consent, Unsubscribe, and Suppression Lists

Phase 28 adds tenant-scoped consent and suppression controls for campaign
delivery. The implementation is infrastructure for operational safety; it is
not a substitute for a jurisdiction-specific legal review.

## Contact Consent

Every contact stores consent independently for `email`, `sms`, and `whatsapp`:

```json
{
  "status": "subscribed",
  "source": "manual",
  "changedAt": "2026-05-23T00:00:00.000Z",
  "metadata": {}
}
```

Supported statuses are `subscribed`, `unsubscribed`, `pending`, and `unknown`.
Campaign sends require `subscribed` consent for the channel. `pending` and
`unknown` produce `*_consent_missing` skip reasons. `unsubscribed` produces
`*_consent_opted_out` unless an active suppression entry exists for the same
address, in which case the suppression reason takes precedence.

Contacts can be updated through the normal contact create/update payload or
with:

- `PATCH /api/v1/contacts/:id/consent`

The patch endpoint accepts:

```json
{
  "channel": "email",
  "status": "unsubscribed",
  "source": "manual",
  "metadata": { "note": "Requested by support ticket" }
}
```

Consent changes are written to `audit_logs` as `contact.consent.updated`.

## Suppression List

Suppression entries are tenant-scoped and channel-scoped. Active entries block
future campaign sends even if a contact is deleted and re-created with the same
email address or phone number.

Core fields:

- `tenantId`
- `channel`: `email`, `sms`, or `whatsapp`
- `value`: normalized email or phone-like address
- `email`, `phone`, `whatsappPhone`: channel-specific copies for inspection
- `reason`: `manual`, `unsubscribe`, `sms_stop`, `whatsapp_opt_out`,
  `provider`, `legal`, `bounce`, `complaint`, or `other`
- `source`: `manual`, `email_unsubscribe`, `twilio`, `sendgrid`, `whatsapp`,
  `provider`, `import`, or `system`
- `status`: `active` or `inactive`

Tenant admins can inspect and create manual suppressions:

- `GET /api/v1/suppression-list`
- `POST /api/v1/suppression-list`
- `DELETE /api/v1/suppression-list/:id`

`DELETE` releases the entry by setting `status: inactive`; it does not remove
the document. Provider, legal, unsubscribe, STOP, bounce, and complaint entries
are protected. Client users cannot release protected entries; a super admin
must explicitly impersonate the tenant and release them.

Suppression changes are audited as `suppression.created` and
`suppression.released`.

## Email Unsubscribe

Email unsubscribe links are signed HMAC tokens. Tokens are not stored in
plaintext. The backend uses `UNSUBSCRIBE_TOKEN_SECRET` when configured and
falls back to `JWT_ACCESS_SECRET`.

Public endpoints:

- `GET /api/v1/public/unsubscribe/email/:token` verifies the token and returns
  the email preview state.
- `POST /api/v1/public/unsubscribe/email` confirms the unsubscribe with
  `{ "token": "..." }`.

Confirmation creates an active email suppression entry with
`reason: "unsubscribe"` and `source: "email_unsubscribe"`, then updates the
matching contact's email consent to `unsubscribed` when the contact still
exists.

The frontend exposes the public confirmation page at:

- `/unsubscribe/email/:token`

Campaign email content includes the public unsubscribe URL when a contact is
known.

## Twilio STOP and Opt-In Callbacks

Twilio inbound opt-out callbacks are accepted at:

- `POST /api/v1/webhooks/twilio/opt-out`

The handler reads `From`, `To`, `Body`, `MessageSid` or `SmsSid`, optional
`TenantId`, and optional `Channel`. Supported opt-out keywords are `STOP`,
`STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT`. Supported opt-in keywords
are `START`, `YES`, and `UNSTOP`.

For STOP-like messages, the handler:

1. Normalizes the sender address.
2. Resolves the tenant from `TenantId` or prior campaign recipients with the
   same channel/address.
3. Upserts one active suppression entry per tenant.
4. Updates matching contact consent to `unsubscribed`.

The upsert makes repeated provider retries idempotent: duplicate STOP callbacks
do not create duplicate active suppression entries.

For START-like messages, Twilio-originated suppression entries for the address
are released and matching contact consent is set back to `subscribed`.

## Campaign Send Rules

Campaign planning checks are run before token preflight, wallet debits, send
limit consumption, and provider calls.

Skip reasons added in Phase 28:

- `email_consent_missing`, `sms_consent_missing`,
  `whatsapp_consent_missing`
- `email_consent_opted_out`, `sms_consent_opted_out`,
  `whatsapp_consent_opted_out`
- `email_suppressed`, `sms_suppressed`, `whatsapp_suppressed`

Skipped recipients remain visible in campaign reports and never consume tokens.

## Import Behaviour

Bulk contact import is still a placeholder, but suppression is stored outside
contacts and keyed by tenant, channel, and normalized address. This means a
future import or a manual re-create of a contact cannot clear suppression state
by overwriting the contact document.
