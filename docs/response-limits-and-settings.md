# Response limits and account settings (Phase 16)

This document captures the per-survey response-limit configuration and the
authenticated `/api/v1/settings/*` surface added in Phase 16.

## Survey response limits

### Configuration shape

The setting lives on `survey.settings.responseLimit` and is copied into
`survey_versions.settings` at publish time, so editing the live draft cannot
loosen the rule for an already-published survey.

```js
settings.responseLimit = {
  mode: 'unlimited', // 'unlimited' | 'one_per_contact' | 'one_per_device' | 'one_per_ip'
  deviceKeyRequired: false, // derived true when mode === 'one_per_device'
  ipRequired: false, // derived true when mode === 'one_per_ip'
  message: 'This survey has already been answered.',
};
```

`settings.oneResponsePerContact` (legacy boolean) is preserved for backwards
compatibility — when set to `true` and `responseLimit.mode === 'unlimited'`
the service falls back to `one_per_contact` behaviour.

A survey with `responseLimit.mode === 'one_per_ip'` MUST also have
`collectIp: true`. The API rejects creates/updates that violate this rule
with `VALIDATION_ERROR`.

### Enforcement

The backend is authoritative. Each public submission goes through:

1. An existence query against the partial-unique indexes that back the rule
   (returns a friendly `RESPONSE_LIMIT_REACHED` error when a match is found).
2. The actual insert. If two submissions race past the existence check, the
   partial-unique index throws a duplicate-key error, which is mapped to the
   same `RESPONSE_LIMIT_REACHED` response.

Stored fields on `responses.metadata`:

- `deviceKeyHash` — set when `mode === 'one_per_device'`. SHA-256 of
  `secret|device|surveyId|clientKey`.
- `ipHash` — set when `mode === 'one_per_ip'`.
- `contactKeyHash` — set when `mode === 'one_per_contact'`. Built from the
  campaign recipient's `contactId` (preferred) or the `submissionToken`.

No raw value is reused as the dedupe key — the survey id and a shared secret
(`RESPONSE_HASH_SECRET`, defaults to `JWT_ACCESS_SECRET`) are mixed into the
input so the same key cannot be correlated across surveys or deployments.

### Public client behaviour

The public form generates an anonymous device key when the renderer reports
`responseLimit.deviceKeyRequired` or `responseLimit.mode === 'one_per_device'`.

- Storage: `localStorage` keyed by `cupcake.devicekey.<slug>`.
- Format: base64url, 24 random bytes.
- Cleared on logout-style flows is unnecessary; the key is survey-scoped.

If the backend returns `RESPONSE_LIMIT_REACHED`, the public form switches to
a friendly "you already answered" state instead of the generic error.

### Verified surveyor submissions

Authenticated surveyor responses use `/api/v1/surveyor/surveys/:id/responses`
instead of the public form endpoint. They bypass public-only response-limit
dedupe, public CAPTCHA, public honeypot checks, anonymous link requirements,
and campaign submission-token requirements. They still validate the published
schema, required fields, conditional visibility, survey status, tenant
isolation, and monthly response quota.

Surveyor responses are persisted with `respondentType: "surveyor"` and
`submittedByUserId`, while anonymous/public responses default to
`respondentType: "public"`.

### Privacy notes

- IP collection only happens when `collectIp` is enabled on the survey.
- Even when IPs are collected, only the hash (`ipHash`) is used for
  deduplication.
- The device key is fully random; no fingerprinting (canvas, fonts, screen
  size, etc.) is performed.

## Account settings API

All routes require an authenticated bearer token. Each operation targets the
caller's own user record — privilege-bearing fields (`role`, `tenantId`,
`status`) cannot be set through these endpoints.

| Method | Path                           | Notes                                                                    |
| ------ | ------------------------------ | ------------------------------------------------------------------------ |
| `GET`  | `/api/v1/settings/profile`     | Returns the authenticated profile incl. preferences.                     |
| `PUT`  | `/api/v1/settings/profile`     | Updates name, email, phone, whatsapp. Email is staged in `pendingEmail`. |
| `PUT`  | `/api/v1/settings/password`    | Requires `currentPassword`, revokes all other refresh tokens on success. |
| `PUT`  | `/api/v1/settings/preferences` | Persists `locale` and `timezone`.                                        |

### Email changes

Email updates are staged in `users.pendingEmail` and never overwrite the
authoritative `email` field. The verification email flow itself is deferred
to a later phase (see [known-limitations.md](known-limitations.md)).

### Password changes

A successful password change revokes every active refresh token for the user
EXCEPT the optional `exemptRefreshTokenId` (reserved for the calling session
when wired up). Other sessions lose access at their next refresh.

### Locale persistence

`preferences.locale` is exposed through `/auth/me` so a returning user lands
in the correct language. The frontend mirrors the saved value into the
runtime i18n helper after login and after every successful preferences save.

Supported locales are listed in
`backend/src/modules/settings/supported-locales.js` and must stay in sync
with the bundle files under `frontend/src/i18n/`.

## Manual verification

The Phase 16 prompt's Verification section maps to these checks:

1. Publish a survey with `one_per_device` and submit twice from the same
   browser — second submission returns 409 `RESPONSE_LIMIT_REACHED`.
2. Publish a survey with `one_per_ip` + `collectIp: true` and submit twice
   from the same IP (use `X-Forwarded-For` if behind a proxy).
3. Send a campaign with `one_per_contact` and resubmit with the same token —
   second submission returns 409 `RESPONSE_LIMIT_REACHED`.
4. Update name/phone in the settings view, reload `/auth/me`, confirm the
   profile shows the new values.
5. Change password, log in with the new credentials, confirm previous
   refresh tokens no longer rotate (HTTP 401).
6. Switch language to Spanish; the UI re-renders without a reload and the
   preference survives a logout/login cycle.
