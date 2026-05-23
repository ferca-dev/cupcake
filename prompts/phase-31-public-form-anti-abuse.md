# Phase 31 - Public Form Anti-Abuse

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-30.

## Goal

Protect public forms from spam, automated submissions, and abusive traffic without breaking accessibility or legitimate responses.

## Scope

Implement public anti-abuse infrastructure. Do not add advanced fraud scoring unless there is already enough data to justify it.

## Tasks

- Add survey-level anti-abuse settings.
- Add CAPTCHA provider abstraction with Cloudflare Turnstile-ready configuration.
- Add honeypot support for public forms.
- Add stricter public rate limits by IP, survey, tenant, and token where applicable.
- Add suspicious submission logging.
- Add backend validation for CAPTCHA/honeypot checks.
- Add frontend CAPTCHA rendering only when required.
- Add admin/client controls for anti-abuse settings.
- Add tests for rate limits, honeypot rejection, CAPTCHA verification, bypass prevention, and accessibility-friendly behavior.
- Update public form security documentation in English.

## Suggested Environment Variables

```env
PUBLIC_FORM_CAPTCHA_PROVIDER="none"
TURNSTILE_SITE_KEY=""
TURNSTILE_SECRET_KEY=""
```

## Infrastructure Details Not To Miss

- Anti-abuse checks must run before response creation.
- Do not rely on frontend-only checks.
- Honeypot fields must not confuse screen readers.
- CAPTCHA failure responses must be clear but not leak abuse logic.
- Public token-linked campaign responses should still work with anti-abuse enabled.
- Rate limits should be configurable by environment and possibly tenant/plan.

## Verification

- Run backend and frontend tests.
- Submit a normal public response and verify it succeeds.
- Submit with honeypot filled and verify it is rejected.
- Enable CAPTCHA and verify missing/invalid token is rejected.
- Simulate rate limit exhaustion and verify consistent error response.
- Verify keyboard/screen-reader behavior is not degraded.

## Definition of Done

- Public forms have configurable anti-abuse protection.
- CAPTCHA provider integration is ready.
- Spam-like submissions are blocked server-side.
- Legitimate respondents retain accessible form behavior.
