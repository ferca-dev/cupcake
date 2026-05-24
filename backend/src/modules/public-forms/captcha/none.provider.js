/**
 * Pass-through CAPTCHA provider. Returned by the factory when
 * `PUBLIC_FORM_CAPTCHA_PROVIDER=none`. Reports itself as disabled so the
 * anti-abuse service can skip verification altogether when no survey opts in
 * to a CAPTCHA, while still treating an explicit per-survey
 * `captchaRequired=true` as a misconfiguration (handled by the service).
 */
export const createNoneCaptchaProvider = () => ({
  name: 'none',
  siteKey: null,
  isEnabled: () => false,
  verify: async () => ({ ok: true }),
});
