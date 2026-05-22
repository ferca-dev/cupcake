/**
 * Shared helpers for the Twilio SMS and WhatsApp providers. Keeps SDK
 * construction, env validation, and response normalisation in one place so
 * the channel-specific providers stay tiny.
 */

const REQUIRED_ENV = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];

export class ProviderConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}

export const assertTwilioBaseEnv = (env, providerName) => {
  const missing = REQUIRED_ENV.filter((key) => !env?.[key]);
  if (missing.length > 0) {
    throw new ProviderConfigurationError(
      `${providerName} requires ${missing.join(', ')} to be set`,
    );
  }
};

/**
 * Resolves the `from` / `messagingServiceSid` pair for a Twilio send. A
 * dedicated From number is preferred when supplied, otherwise the messaging
 * service is used. At least one must be configured.
 */
export const resolveTwilioFrom = ({ env, fromKey, providerName }) => {
  const from = env?.[fromKey] ?? '';
  const messagingServiceSid = env?.TWILIO_MESSAGING_SERVICE_SID ?? '';
  if (!from && !messagingServiceSid) {
    throw new ProviderConfigurationError(
      `${providerName} requires either ${fromKey} or TWILIO_MESSAGING_SERVICE_SID to be set`,
    );
  }
  return { from: from || null, messagingServiceSid: messagingServiceSid || null };
};

/**
 * Twilio SDK does not surface a stable enum for failure reasons but it
 * consistently exposes `code`, `status`, and `message` on errors and on the
 * message resource. Map the common subset to short, stable identifiers the
 * campaign report can group on. Anything unknown falls back to
 * `provider_failure` so we never persist a wall of vendor text.
 */
export const normalizeTwilioFailure = ({ status = null, code = null, message = null } = {}) => {
  if (status === 'failed' || status === 'undelivered') return 'twilio_delivery_failed';
  if (code === 21211 || code === 21610) return 'invalid_recipient';
  if (code === 21408) return 'permission_denied';
  if (code === 20003) return 'authentication_failed';
  if (code === 21614) return 'invalid_recipient';
  if (code === 21612) return 'unreachable_recipient';
  if (code === 30004 || code === 30005) return 'unreachable_recipient';
  if (code === 30007) return 'message_blocked';
  if (typeof status === 'string') return `twilio_${status}`;
  if (message) return 'twilio_error';
  return 'provider_failure';
};

/**
 * Lazily construct the Twilio client. Importing inside the closure keeps the
 * default mock setup free of `twilio` runtime requirements during tests that
 * never touch the real provider.
 */
export const createTwilioClient = async ({ env }) => {
  const twilioModule = await import('twilio');
  const twilio = twilioModule.default ?? twilioModule;
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
};
