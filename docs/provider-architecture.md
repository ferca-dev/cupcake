# Messaging Provider Architecture

Phase 09 introduces campaign sending across three channels — email, SMS, and
WhatsApp — through a thin provider abstraction. The campaign domain code stays
provider-agnostic so production adapters can be added later without changing
business logic.

## Goals

- Keep `campaign.service.js` free of provider-specific branching.
- Let environment variables (`EMAIL_PROVIDER`, `SMS_PROVIDER`,
  `WHATSAPP_PROVIDER`) pick the active implementation.
- Make recipient validation a provider concern, so a future adapter can apply
  channel-specific rules (e.g. WhatsApp-business templates, SES suppression
  lists) without leaking out of the module.
- Surface skip and failure reasons in a stable shape so reports stay accurate
  across providers.

## The Provider Interface

Every provider exposes the same three methods:

```js
{
  getProviderName(): string,
  validateRecipient(contact): { ready, reason, recipient },
  send(messagePayload): Promise<{ success, provider, providerMessageId, reason }>,
}
```

- **`getProviderName`** is recorded on each recipient document so the report
  can attribute messages to a specific adapter.
- **`validateRecipient`** receives a Mongoose `Contact` (or a plain object with
  the same shape) and returns a normalised recipient address plus an
  optional skip reason from the canonical list (`missing_email`,
  `invalid_phone`, `contact_blocked`, etc.). Returning `{ ready: false }` lets
  the campaign service mark the recipient as `skipped` without calling the
  provider, which keeps the send loop tolerant of incomplete contacts.
- **`send`** receives a `MessagePayload` (channel, recipient, submission
  token, public URL, contact/campaign/survey metadata) and resolves with a
  result envelope. A failed result is mapped to a `failed` recipient record
  with the provided `reason`; thrown errors are also caught and downgraded to
  a `failed` status so a single broken contact never aborts the bulk send.

## The Factory

`provider.factory.js` exposes `resolveProviders({ env })`, which returns one
provider per channel based on the env values. Phase 15 ships:

| Env var             | Supported values   | Adapter file                        |
| ------------------- | ------------------ | ----------------------------------- |
| `EMAIL_PROVIDER`    | `mock`, `sendgrid` | `twilio-sendgrid-email.provider.js` |
| `SMS_PROVIDER`      | `mock`, `twilio`   | `twilio-sms.provider.js`            |
| `WHATSAPP_PROVIDER` | `mock`, `twilio`   | `twilio-whatsapp.provider.js`       |

Adding a new adapter follows the same pattern as before:

1. Implement the three-method interface in `providers/<vendor>.provider.js`.
2. Register its factory in the relevant map (`EMAIL_PROVIDERS`,
   `SMS_PROVIDERS`, `WHATSAPP_PROVIDERS`) keyed by the env value.
3. Set the corresponding env variable (e.g. `EMAIL_PROVIDER=ses`).

No changes to `campaign.service.js` are required.

## Twilio SMS and WhatsApp

`createTwilioSmsProvider` and `createTwilioWhatsAppProvider` both wrap the
official `twilio` SDK. They share validation logic via `twilio.shared.js` and
fail fast at construction time when `TWILIO_ACCOUNT_SID` or `TWILIO_AUTH_TOKEN`
are missing. Either a channel-specific From number
(`TWILIO_SMS_FROM` / `TWILIO_WHATSAPP_FROM`) or a `TWILIO_MESSAGING_SERVICE_SID`
must be set. When `TWILIO_STATUS_CALLBACK_URL` is configured, the provider
attaches it on each send so Twilio can post delivery status updates to the
webhook endpoint described below.

Provider responses are normalised so the campaign report sees a stable set of
failure reasons (`invalid_recipient`, `authentication_failed`,
`twilio_delivery_failed`, etc.) instead of vendor-specific message text.

## Twilio SendGrid Email

`createTwilioSendGridEmailProvider` wraps `@sendgrid/mail`. It requires
`TWILIO_SENDGRID_API_KEY` and `TWILIO_SENDGRID_FROM_EMAIL`. The submission
token is forwarded as a SendGrid `customArgs` value so event webhooks can map
opens/clicks back to a campaign recipient without exposing tenant identifiers.

## Webhook Endpoints

Two routes are wired but optional. They update existing recipient documents
based on incoming events and never trigger a new send:

- `POST /api/v1/webhooks/twilio/messages` — Twilio SMS/WhatsApp status
  callbacks. Expects `application/x-www-form-urlencoded`. Fields it reads:
  `MessageSid`, `MessageStatus`, optional `ErrorCode`.
- `POST /api/v1/webhooks/twilio/opt-out` — Twilio inbound STOP/START-style
  callbacks. Reads `From`, `To`, `Body`, `MessageSid`/`SmsSid`, optional
  `TenantId`, and optional `Channel`. STOP-like callbacks upsert tenant-scoped
  suppression entries and update matching contact consent idempotently.
- `POST /api/v1/webhooks/sendgrid/events` — SendGrid Event Webhook. Expects
  a JSON array of events. Reads `event`, `submissionToken`, `sg_message_id`.

Signature verification (Twilio's `X-Twilio-Signature` and SendGrid's
`X-Twilio-Email-Event-Webhook-Signature`) is intentionally left as a follow-up
once the public webhook host is finalised. Production deployments should
enable verification before exposing these routes to the internet.

## Mock Providers

Mock implementations remain the default and are exercised by local
development and the test suite.

- `mock-email`: validates `contact.email` and fails any address whose local
  part contains the substring `fail`, which lets tests assert the failure
  branch without a real network call.
- `mock-sms`: validates `contact.phone` and fails any phone ending in `0000`.
- `mock-whatsapp`: validates `contact.whatsappPhone` with the same `0000`
  heuristic.

Mock providers never make network calls and return deterministic
`providerMessageId` values so test snapshots stay stable.

## Submission Tokens and Public URLs

The campaign service generates a 32-character URL-safe submission token per
recipient using `crypto.randomBytes(24).toString('base64url')`. The token is
unique across the `campaign_recipients` collection (enforced by a unique
index) and is composed into a public URL using `FRONTEND_URL` — never a
hardcoded host. Tokens are looked up at submission time by the public form
service so the resulting response is linked back to the campaign recipient and
the recipient's status is moved to `clicked`.

## Skip Reasons and Reports

The send service maintains a counter map keyed by skip reason so the campaign
summary reflects:

- `missing_email` / `invalid_email`
- `missing_phone` / `invalid_phone`
- `missing_whatsapp_phone` / `invalid_whatsapp_phone`
- `contact_blocked`
- `contact_archived`
- `duplicate_recipient`
- `email_consent_missing` / `sms_consent_missing` /
  `whatsapp_consent_missing`
- `email_consent_opted_out` / `sms_consent_opted_out` /
  `whatsapp_consent_opted_out`
- `email_suppressed` / `sms_suppressed` / `whatsapp_suppressed`

`GET /campaigns/:id/report` aggregates the persisted recipients (instead of
relying on the cached summary) so the report stays accurate even if a future
job re-runs and mutates recipient state.

## Backwards-Compatible Recipient Records

Every contact × channel attempt produces exactly one `campaign_recipients`
document. Skipped recipients are recorded with a `null` `recipient` and a
populated `skippedReason` rather than being silently dropped, which means:

- Re-running a campaign cannot accidentally create new recipient duplicates
  because the dedupe key `(channel, recipient)` plus `(channel, contactId)`
  catches both variations.
- The detail page surfaces every attempted contact so customers can verify
  why an expected message did not go out.
