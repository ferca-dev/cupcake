import { loadEnv } from '../../../config/env.js';
import { createNoneCaptchaProvider } from './none.provider.js';
import { createTurnstileCaptchaProvider } from './turnstile.provider.js';

let cachedProvider = null;
let overrideProvider = null;

const buildProvider = () => {
  const env = loadEnv();
  switch (env.PUBLIC_FORM_CAPTCHA_PROVIDER) {
    case 'turnstile':
      return createTurnstileCaptchaProvider({
        siteKey: env.TURNSTILE_SITE_KEY,
        secretKey: env.TURNSTILE_SECRET_KEY,
      });
    case 'none':
    default:
      return createNoneCaptchaProvider();
  }
};

/**
 * Returns the singleton CAPTCHA provider selected by the environment. The
 * factory caches the provider so the public form GET endpoint can return a
 * stable `siteKey` without re-reading env on every request. Tests can swap in
 * a fake via `setCaptchaProviderForTest`.
 */
export const getCaptchaProvider = () => {
  if (overrideProvider) return overrideProvider;
  if (!cachedProvider) cachedProvider = buildProvider();
  return cachedProvider;
};

/**
 * Test helper: swap in a provider stub. Pass `null` to clear the override and
 * fall back to the env-driven provider.
 */
export const setCaptchaProviderForTest = (provider) => {
  overrideProvider = provider;
};

/**
 * Test helper: drop the cached env-driven provider so the next call to
 * `getCaptchaProvider()` rebuilds from `loadEnv()`. Useful after the env
 * cache itself is reset.
 */
export const resetCaptchaProviderCache = () => {
  cachedProvider = null;
};
