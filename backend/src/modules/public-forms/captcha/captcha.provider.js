/**
 * CAPTCHA provider contract. Implementations must expose:
 *
 *   name        — short identifier returned to the public form metadata
 *   siteKey     — public site key safe to expose to the client (or null)
 *   isEnabled() — whether the provider produces a usable challenge in this
 *                 environment. `false` short-circuits the verification flow
 *                 so a misconfigured environment does not silently let
 *                 submissions through with a missing token.
 *   verify({ token, ip }) — resolves to
 *                 { ok: boolean, errorCodes?: string[], rawProviderResponse?: object }
 *
 * Implementations must never throw on a failed challenge: they must resolve
 * with `ok: false` so the caller can log the suspicious submission cleanly.
 * Network/runtime errors should also resolve with `ok: false` to preserve
 * the "fail closed" invariant from the public form perspective.
 */
export const captchaProviderShape = Object.freeze({
  name: 'string',
  siteKey: 'string | null',
  isEnabled: '() => boolean',
  verify: '({ token, ip }) => Promise<{ ok, errorCodes?, rawProviderResponse? }>',
});
