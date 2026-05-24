# Public form anti-abuse (Phase 31)

This document describes the public-form anti-abuse stack added in Phase 31:
configurable CAPTCHA via Cloudflare Turnstile, an invisible honeypot, a fill
time floor, multi-dimensional sliding-window rate limits, and a suspicious
submission audit log.

The goal is to protect the unauthenticated `/api/v1/public/forms/:slug/responses`
endpoint without breaking accessibility, real respondents, or token-linked
campaign flows.

## Defense layers

| Layer | Default | Where | Notes |
| --- | --- | --- | --- |
| Global IP rate limit | 30 / min | `createPublicFormRateLimiter` | Outer guard; not configurable per survey. |
| Honeypot | Enabled | Backend + frontend | Visually hidden field; non-empty value rejects the submission. |
| Min fill time | Off (`0` s) | Backend | Floor for the time the form was open before submission. |
| Per-IP burst | 30 / min | Backend (env / per-survey override) | Sliding window of submissions per IP. |
| Per-survey burst | 120 / min | Backend (env) | Aggregate burst on a single survey across all IPs. |
| Per-tenant burst | 600 / min | Backend (env) | Aggregate burst across all of a tenant's surveys. |
| Per-token burst | 10 / min | Backend (env / per-survey override) | Burst on a single submission token. |
| CAPTCHA | Off | Backend + frontend | Cloudflare Turnstile, configurable per survey. |
| Audit log | Always | Backend (`suspicious_submissions`) | Every detection records a row, even in `flag` mode. |

Anti-abuse checks fire **before** the response is created so a flood of bot
traffic cannot exhaust a tenant's monthly response quota.

## Configuration

### Environment variables

```
PUBLIC_FORM_CAPTCHA_PROVIDER="none"   # 'none' | 'turnstile'
TURNSTILE_SITE_KEY=""
TURNSTILE_SECRET_KEY=""
PUBLIC_FORM_HONEYPOT_FIELD="website_url"
PUBLIC_FORM_RATE_LIMIT_PER_IP_PER_MINUTE=30
PUBLIC_FORM_RATE_LIMIT_PER_SURVEY_PER_MINUTE=120
PUBLIC_FORM_RATE_LIMIT_PER_TENANT_PER_MINUTE=600
PUBLIC_FORM_RATE_LIMIT_PER_TOKEN_PER_MINUTE=10
PUBLIC_FORM_MIN_FILL_SECONDS=0
```

`PUBLIC_FORM_CAPTCHA_PROVIDER=turnstile` requires both Turnstile keys and is
asserted at boot — a misconfigured environment fails fast rather than silently
letting submissions through with no challenge.

Setting any rate-limit value to `0` disables that dimension.

### Per-survey overrides

The survey settings document carries an `antiAbuse` block. Defaults preserve
behaviour for surveys created before Phase 31.

```js
settings.antiAbuse = {
  captchaRequired: false,
  honeypotEnabled: true,
  minFillSeconds: null,       // override floor; null inherits env
  perIpPerMinute: null,       // override per-IP limit; null inherits env
  perTokenPerMinute: null,    // override per-token limit; null inherits env
  suspiciousAction: 'reject', // 'reject' | 'flag'
};
```

`suspiciousAction: 'flag'` keeps the submission alive but writes a
`suspicious_submissions` row so abuse can be reviewed without losing data.
Honeypot violations and CAPTCHA misconfiguration always reject, regardless of
this setting — letting them through would defeat the controls.

## CAPTCHA provider abstraction

The provider contract lives in
`backend/src/modules/public-forms/captcha/captcha.provider.js`. Each provider
exposes:

- `name` — short identifier returned to the public form metadata
- `siteKey` — public site key safe to expose to the client
- `isEnabled()` — whether the provider can produce a usable challenge
- `verify({ token, ip })` — never throws; resolves with `{ ok, errorCodes? }`

Two providers ship:

- `NoneCaptchaProvider` (`none.provider.js`) — pass-through; reports itself as
  disabled so the anti-abuse service can short-circuit verification when no
  survey opts in.
- `TurnstileCaptchaProvider` (`turnstile.provider.js`) — POSTs the client
  token plus the request IP to
  `https://challenges.cloudflare.com/turnstile/v0/siteverify` and normalises
  the response. Failures (network, non-2xx, `success: false`) all resolve to
  `{ ok: false }` so the caller can record a suspicious submission cleanly.

The factory (`captcha.factory.js`) selects the provider from
`PUBLIC_FORM_CAPTCHA_PROVIDER`, caches it for the lifetime of the process, and
exposes `setCaptchaProviderForTest` so specs can inject a stub.

Adding a third provider is a code-only change: implement the contract, extend
the factory `switch`, and update the env enum.

## Honeypot

The renderer embeds a hidden `<input>` named after `PUBLIC_FORM_HONEYPOT_FIELD`
(default `website_url`). The wrapper uses `aria-hidden="true"` and a
visually-hidden CSS clip; the input has `tabindex="-1"` and `autocomplete="off"`.
Screen readers skip it, keyboard users never reach it, and bots that fill every
visible-looking input get rejected.

The client always sends the honeypot value (empty for real respondents) so the
backend can also reject a submission that bypasses the renderer entirely. The
rejection surfaces as a generic `VALIDATION_ERROR` with the message
`Submission rejected.` — never naming the trap or the field, so a scraper
cannot learn which inputs to skip.

## Sliding-window rate limits

`anti-abuse.service.js` keeps per-process counters keyed by
`<dimension>:<identifier>`. Each entry is the list of unix-ms timestamps of
recorded hits within the trailing 60 seconds. Counters reset when the process
restarts — these are burst guards, not durable quotas. Production deployments
behind a reverse proxy should keep their own per-IP limits at the edge as the
authoritative cap.

When a dimension trips, the service writes a `suspicious_submissions` row and
either throws `RateLimitError` (the default `reject` mode) or returns silently
(`flag` mode). All rejection messages are intentionally generic so a probing
client cannot tell which dimension fired.

## Suspicious submission log

`suspicious_submissions` is the persistent audit trail. Each row records:

- `tenantId`, `surveyId`, `surveySlug`, `submissionToken`
- `ip` (truncated) and `ipHash` (SHA-256 with a static salt)
- `userAgent` (truncated to 500 chars)
- `reason` — one of `honeypot_filled`, `captcha_missing`, `captcha_invalid`,
  `captcha_misconfigured`, `rate_limit_ip`, `rate_limit_survey`,
  `rate_limit_tenant`, `rate_limit_token`, `too_fast`
- `action` — `reject` or `flag`
- `details` — arbitrary JSON (e.g. the rate-limit dimension that fired)

The collection is tenant-scoped and indexed by `(tenantId, createdAt)` and
`(surveyId, createdAt)` so future admin tooling can pull a quick review feed.

## Public form metadata payload

`GET /api/v1/public/forms/:slug` returns the renderer hints under
`survey.settings.antiAbuse`:

```json
{
  "antiAbuse": {
    "captcha": {
      "required": false,
      "provider": "none",
      "siteKey": null
    },
    "honeypot": {
      "enabled": true,
      "fieldName": "website_url"
    },
    "minFillSeconds": 0
  }
}
```

`siteKey` is only populated when `captcha.required === true` so a survey that
does not opt in never leaks the Turnstile site key to the public.

## Accessibility

- The honeypot is hidden via CSS clip (not `display: none` which some bots
  detect) and removed from the accessibility tree with `aria-hidden`. Keyboard
  users never tab into it because of `tabindex="-1"`.
- A localised `honeypotLabel` string is still attached so the rare assistive
  technology that walks the DOM regardless of ARIA tells the user to leave
  the field blank.
- The CAPTCHA widget only mounts when the survey opts in. Cloudflare's
  Turnstile widget is itself accessible (keyboard-operable, supports the
  managed/non-interactive mode).
- Rejection messages remain plain text alerts so they are announced by
  assistive technology.

## Surveyor and authenticated bypass

The surveyor role lands in Phase 35. The shared context mandates that
surveyor submissions bypass public CAPTCHA, public device/IP limits, and
campaign token requirements. Phase 31 does not yet expose a surveyor caller
on the public form route, so no bypass is wired today. When the surveyor flow
lands, the anti-abuse service must be called with a surveyor flag that
short-circuits CAPTCHA, honeypot, and the public sliding-window limits while
still recording suspicious activity for monitoring.
