# Phase 16 - Response Rules and Account Settings

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-15.

## Goal

Add survey response-limit settings for one response per contact, device, or IP, and add an authenticated settings area for profile, password, language, and related user preferences.

## Scope

Implement practical account settings and response limits. Do not add organization billing settings or full team management unless already available.

## Tasks

- Extend survey settings with a response limit configuration.
- Support at least: `unlimited`, `one_per_contact`, `one_per_device`, and `one_per_ip`.
- Copy response limit settings into published survey versions.
- Update public response validation to enforce the selected response limit.
- Add anonymous device key generation in the public frontend for `one_per_device`.
- Store response-limit tracking values as hashes where possible.
- Add clear public-form error states when a respondent already answered.
- Update builder or survey settings UI to configure response limits.
- Create backend account settings endpoints.
- Create user profile update flow.
- Create password change flow that verifies current password.
- Persist language preference server-side.
- Update frontend auth/user store to reflect settings changes.
- Create `SettingsView` or a settings section with profile, password, and language panels.
- Add route and navigation entry for settings.
- Add tests for response limits, password change, profile update, and language persistence.
- Update API and user settings documentation in English.

## Suggested Survey Settings Shape

```js
{
  responseLimit: {
    mode: 'unlimited',
    deviceKeyRequired: false,
    ipRequired: false,
    message: 'This survey has already been answered.'
  }
}
```

Allowed modes:

- `unlimited`
- `one_per_contact`
- `one_per_device`
- `one_per_ip`

## Suggested API Endpoints

- `GET /api/v1/settings/profile`
- `PUT /api/v1/settings/profile`
- `PUT /api/v1/settings/password`
- `PUT /api/v1/settings/preferences`

## Infrastructure Details Not To Miss

- Backend response-limit checks must be authoritative.
- `one_per_contact` applies only when a response is tied to a campaign recipient/contact token.
- `one_per_device` should use a generated client-side key, not invasive fingerprinting.
- `one_per_ip` requires IP collection and must respect proxy configuration.
- Use hashed values for device keys and IP tracking where practical.
- Handle race conditions so two fast submissions cannot bypass one-response rules.
- Password changes must revoke or rotate refresh tokens.
- Profile updates must never allow role, tenant, or permission escalation.
- Email change should be prepared for verification even if verification sending is deferred.
- Language updates must affect frontend locale after save.

## Verification

- Run backend and frontend tests.
- Configure a survey as `one_per_device`; submit once and verify the second submission is blocked from the same browser/device key.
- Configure a survey as `one_per_ip`; submit once and verify a second submission from the same IP is blocked.
- Configure campaign-linked response as `one_per_contact`; verify the same recipient cannot submit twice.
- Update profile data and verify `/auth/me` reflects it.
- Change password and verify old credentials fail while new credentials work.
- Change language and verify frontend locale updates.

## Definition of Done

- Surveys can be configured for one response per contact, device, or IP.
- Public submission validation enforces response limits server-side.
- Users can update profile data, password, and language from a settings area.
- Settings are documented and tested.
