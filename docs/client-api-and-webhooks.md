# Client API keys and outbound webhooks

Phase 32 ships the developer integration surface that lets tenants embed
Cupcake into external systems. Two complementary primitives are introduced:

- **API keys** — tenant-scoped credentials with a narrow set of scopes that
  authenticate machine-to-machine calls against the existing `/api/v1`
  surface.
- **Outbound webhooks** — signed HTTP callbacks that fire when a configured
  business event happens inside the tenant.

Both are managed under `Settings → Developer` in the dashboard sidebar.
Permission `users.manage` gates the section so the same staff who control
team membership also control integration credentials.

## API keys

### Format

A key is presented to the user exactly once, in the format `prefix.secret`:

```
cup_live_AB23CD45EF67.qwM1Wt8r2YPXn1c2c7r3wjMc8xWZRf3M9b6lQjVqM5g
```

- `prefix` (`cup_live_…`) is stored in plaintext and indexed so the auth
  middleware can locate the row in O(1) without scanning the tenant set.
- `secret` is the 256-bit random tail. Only the HMAC-SHA-256 of this part is
  persisted (`apiKey.secretHash`) using `WEBHOOK_SIGNING_SECRET` as the
  hashing key — there is no way to recover the original from the database.

The raw key is returned in the response of `POST /developer/api-keys` (and on
`/rotate`) and is never echoed back through `GET /developer/api-keys`.

### Scopes

Scopes are the public, narrow contract — they map to the existing internal
permissions but stay stable even when the role catalogue evolves:

| Scope             | Internal permissions                                          |
| ----------------- | ------------------------------------------------------------- |
| `surveys:read`    | `surveys.view`                                                |
| `surveys:write`   | `surveys.view`, `surveys.create`, `surveys.update`            |
| `responses:read`  | `responses.view`                                              |
| `contacts:read`   | `contacts.manage`, `groups.manage`                            |
| `contacts:write`  | `contacts.manage`, `groups.manage`                            |
| `campaigns:read`  | `campaigns.send`                                              |
| `campaigns:send`  | `campaigns.send`                                              |
| `reports:read`    | `dashboard.view`, `responses.view`                            |

`users.manage`, `tenants.manage`, and `admin.dashboard.view` are intentionally
absent — API keys can never grant super admin operations or tenant
administration.

### Endpoints

| Method | Path                                       | Purpose                              |
| ------ | ------------------------------------------ | ------------------------------------ |
| GET    | `/api/v1/developer/api-keys`               | List the tenant's keys               |
| POST   | `/api/v1/developer/api-keys`               | Create a new key (returns the raw)   |
| POST   | `/api/v1/developer/api-keys/:id/rotate`    | Revoke + reissue (raw returned once) |
| POST   | `/api/v1/developer/api-keys/:id/revoke`    | Revoke without reissuing             |
| DELETE | `/api/v1/developer/api-keys/:id`           | Permanently delete a key             |

### Usage

Authenticate either with the standard bearer header or the dedicated
`X-API-Key` header:

```bash
curl -H "Authorization: Bearer cup_live_AB23…qwM1…" \
     https://app.cupcake.local/api/v1/surveys
```

The middleware refuses revoked or expired keys with `401 Unauthorized` and
records `lastUsedAt` / `lastUsedIp` opportunistically on every successful
authentication.

## Outbound webhooks

### Configuration

`Developer → Webhooks → New endpoint` creates a destination with:

- A descriptive name.
- A target HTTPS URL.
- A set of event subscriptions (see catalogue below).
- A signing secret generated on creation (and rotatable on update).
- A status flag: `active`, `paused`, or `disabled`. Paused/disabled
  endpoints stop receiving deliveries without losing configuration or the
  history of past deliveries.

### Event catalogue

| Event                  | Fires when                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| `response.submitted`   | A respondent submits a public-form response                        |
| `campaign.completed`   | A campaign send finishes (success or completed_with_errors)        |
| `campaign.failed`      | A campaign send is rejected by preflight or aborts mid-flight       |
| `payment.approved`     | A Mercado Pago transaction transitions to `approved`               |
| `wallet.low_balance`   | The daily reminder detects a wallet below the configured threshold |
| `subscription.failed`  | A subscription invoice ends in `rejected`                          |

Payloads include `id`, `type`, `createdAt`, `deliveredAttempt`, `tenantId`,
and an event-specific `data` object. They never include the full set of
answers for a response — the receiver can read the response by id via the
authenticated API when more detail is required.

### Signing

Every delivery is signed with HMAC-SHA-256 using the endpoint's secret. The
canonical string is `${timestamp}.${rawBody}` and the signature is emitted
in a Stripe-style header so a future algorithm upgrade can coexist with
`v1`:

```
X-Cupcake-Signature: t=1716489600,v1=2d2c0a9b18a4…
X-Cupcake-Event-Id:   01HXYZK…
X-Cupcake-Event-Type: response.submitted
X-Cupcake-Timestamp:  1716489600
```

Receiver verification (example):

```js
const expected = crypto
  .createHmac('sha256', endpointSecret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'),
                            Buffer.from(provided, 'hex'))) {
  return res.status(401).send('invalid signature');
}
```

`signWebhookPayload` / `verifyWebhookSignature` from
`backend/src/modules/developer/webhook-signing.js` are reusable references.

### Retries

A failed delivery (network error, timeout, or non-2xx response) is retried
through the `webhook.retry` job queue with exponential backoff and jitter
(roughly 30s → 2m → 5m → 15m → 30m → 1h). After
`JOB_MAX_ATTEMPTS` attempts the row transitions to `dead_letter` and stays
there until an operator inspects the cause.

The dispatcher is idempotent on the receiver side: every payload includes a
unique `eventId` so consumers can deduplicate retries against their own
storage.

### Delivery log

`GET /api/v1/developer/webhooks/:id/deliveries` returns the most recent
attempts with status code, attempt number, duration, and a truncated
response body snippet. Sensitive header-shaped substrings (`Authorization`,
`Cookie`, `Set-Cookie`, `X-API-Key`, `X-Cupcake-Signature`) are redacted
defensively if a misconfigured receiver echoes them back.

`POST /api/v1/developer/webhooks/:id/test` runs the dispatcher inline so the
caller can verify the destination immediately. The same code path is used by
the test event button in the dashboard.

## Environment variables

| Variable                                 | Purpose                                                                         | Default                |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| `WEBHOOK_SIGNING_SECRET`                 | HMAC secret used to derive `apiKey.secretHash`. Rotating it invalidates all keys. | falls back to JWT secret |
| `API_KEY_DEFAULT_RATE_LIMIT_PER_MINUTE`  | Target per-key request quota. Phase 32 exposes the value; enforcement is deferred. | `60`                 |
| `JOB_MAX_ATTEMPTS`                       | Maximum retry attempts before the delivery is dead-lettered.                    | `5`                    |
| `JOB_QUEUE_DRIVER`                       | `memory` (Mongo-backed) for local/single-node, `inline` for tests.              | `memory`               |

## Operational notes

- Webhook secrets must be generated server-side and shown to the user only
  once. The UI does not display them again after the create/rotate dialog
  closes.
- Each delivery row is associated with a single endpoint and tenant. Deleting
  an endpoint preserves history but causes pending retries to dead-letter
  with `endpoint_missing` so the queue does not loop forever.
- The dispatcher's HTTP client has a 10 s timeout and aborts with
  `request_timeout`. Slow receivers should respond quickly (e.g. enqueue and
  return 202) rather than performing heavy processing in the request path.
