import { logger } from '../../../common/utils/logger.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const log = logger.child({ module: 'public-forms/captcha/turnstile' });

/**
 * Cloudflare Turnstile provider. Sends the client token plus the request IP
 * (when known) to Cloudflare's `siteverify` endpoint and normalises the
 * response into the provider contract.
 *
 * The provider never throws — network or runtime failures resolve to
 * `{ ok: false }` so the caller can record a suspicious submission and
 * surface a generic error to the client without leaking abuse logic.
 *
 * @param {object} options
 * @param {string} options.siteKey
 * @param {string} options.secretKey
 * @param {typeof globalThis.fetch} [options.fetchImpl] - injectable for tests
 */
export const createTurnstileCaptchaProvider = ({ siteKey, secretKey, fetchImpl = fetch } = {}) => {
  if (!secretKey) {
    throw new Error('TurnstileCaptchaProvider requires a secret key');
  }

  return {
    name: 'turnstile',
    siteKey: siteKey || null,
    isEnabled: () => Boolean(secretKey),
    verify: async ({ token, ip } = {}) => {
      if (!token || typeof token !== 'string') {
        return { ok: false, errorCodes: ['missing-input-response'] };
      }
      const body = new URLSearchParams();
      body.set('secret', secretKey);
      body.set('response', token);
      if (ip) body.set('remoteip', ip);

      try {
        const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        });
        if (!response?.ok) {
          log.warn({ status: response?.status }, 'Turnstile siteverify returned non-2xx');
          return { ok: false, errorCodes: ['provider-http-error'] };
        }
        const payload = await response.json();
        // The raw response intentionally omits the secret key. Action and
        // hostname are not asserted here so the provider stays usable on
        // multi-domain deployments.
        return {
          ok: Boolean(payload?.success),
          errorCodes: Array.isArray(payload?.['error-codes']) ? payload['error-codes'] : undefined,
          rawProviderResponse: { success: Boolean(payload?.success) },
        };
      } catch (err) {
        log.error({ err }, 'Turnstile siteverify call failed');
        return { ok: false, errorCodes: ['provider-network-error'] };
      }
    },
  };
};
