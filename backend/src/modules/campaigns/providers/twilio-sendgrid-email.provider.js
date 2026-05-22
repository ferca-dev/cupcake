import { isValidEmail, normaliseEmail } from '../../contacts/contact.validation.js';
import { buildEmailContent, buildEmailSubject } from './provider.messages.js';
import { ProviderConfigurationError } from './twilio.shared.js';

const PROVIDER_NAME = 'twilio-sendgrid-email';

const REQUIRED_ENV = ['TWILIO_SENDGRID_API_KEY', 'TWILIO_SENDGRID_FROM_EMAIL'];

const assertSendGridEnv = (env) => {
  const missing = REQUIRED_ENV.filter((key) => !env?.[key]);
  if (missing.length > 0) {
    throw new ProviderConfigurationError(
      `${PROVIDER_NAME} requires ${missing.join(', ')} to be set`,
    );
  }
};

const normalizeSendGridFailure = (err) => {
  const status = err?.code ?? err?.response?.statusCode ?? null;
  if (status === 401 || status === 403) return 'authentication_failed';
  if (status === 413) return 'payload_too_large';
  if (typeof status === 'number' && status >= 400 && status < 500) return 'invalid_request';
  if (typeof status === 'number' && status >= 500) return 'provider_unavailable';
  return 'provider_failure';
};

/**
 * Twilio SendGrid email provider. Uses the official `@sendgrid/mail` SDK. The
 * SDK is imported lazily so the default mock setup never requires it to be
 * present at runtime.
 *
 * @param {object} deps
 * @param {object} deps.env
 * @param {object} [deps.client] - Optional pre-built sgMail-like object for tests.
 */
export const createTwilioSendGridEmailProvider = ({ env, client = null } = {}) => {
  assertSendGridEnv(env);

  let cachedClient = client;
  const getClient = async () => {
    if (!cachedClient) {
      const sgMailModule = await import('@sendgrid/mail');
      const sgMail = sgMailModule.default ?? sgMailModule;
      sgMail.setApiKey(env.TWILIO_SENDGRID_API_KEY);
      cachedClient = sgMail;
    }
    return cachedClient;
  };

  return {
    getProviderName() {
      return PROVIDER_NAME;
    },

    validateRecipient(contact) {
      if (!contact) return { ready: false, reason: 'missing_email', recipient: null };
      if (contact.status === 'blocked') {
        return { ready: false, reason: 'contact_blocked', recipient: null };
      }
      if (contact.status === 'archived') {
        return { ready: false, reason: 'contact_archived', recipient: null };
      }
      const normalised = normaliseEmail(contact.email ?? null);
      if (!normalised) return { ready: false, reason: 'missing_email', recipient: null };
      if (!isValidEmail(normalised)) {
        return { ready: false, reason: 'invalid_email', recipient: null };
      }
      return { ready: true, reason: null, recipient: normalised };
    },

    async send(payload) {
      const sgMail = await getClient();
      const subject = buildEmailSubject(payload);
      const { text, html } = buildEmailContent(payload);
      const message = {
        to: payload.recipient,
        from: {
          email: env.TWILIO_SENDGRID_FROM_EMAIL,
          name: env.TWILIO_SENDGRID_FROM_NAME || 'Cupcake',
        },
        subject,
        text,
        html,
        // Carry the submission token in a custom arg so SendGrid event
        // webhooks can attribute opens/clicks back to the recipient document
        // without exposing tenant identifiers.
        customArgs: {
          campaignId: payload?.campaign?.id ?? '',
          submissionToken: payload?.submissionToken ?? '',
        },
      };

      try {
        const response = await sgMail.send(message);
        const headers = Array.isArray(response) ? response[0]?.headers : response?.headers;
        const providerMessageId =
          headers?.['x-message-id'] ?? headers?.['X-Message-Id'] ?? null;
        return {
          success: true,
          provider: PROVIDER_NAME,
          providerMessageId,
          reason: null,
        };
      } catch (err) {
        return {
          success: false,
          provider: PROVIDER_NAME,
          providerMessageId: null,
          reason: normalizeSendGridFailure(err),
        };
      }
    },
  };
};
