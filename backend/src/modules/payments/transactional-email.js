import { loadEnv } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Transactional email sender used by payment notifications. Unlike the
 * campaign email provider (which builds survey-flavoured templates from a
 * `MessagePayload`), this helper accepts an explicit subject/text/html so the
 * payment module owns its own copy. It picks between three concrete senders:
 *
 *   - `mock`: logs and reports success without leaving the process. Tests
 *     and local dev use this by default.
 *   - `sendgrid`: uses the official `@sendgrid/mail` SDK. The SDK is imported
 *     lazily so projects that never enable SendGrid never need it installed.
 *   - `smtp`/other providers can be added later behind the same interface.
 *
 * Selection follows the existing campaign provider config (`EMAIL_PROVIDER`)
 * so an operator who already uses SendGrid for campaigns does not have to
 * configure anything new.
 */

const createMockSender = () => ({
  async send({ to, subject }) {
    logger.debug({ to, subject }, 'mock transactional email delivered');
    return { success: true, providerMessageId: `mock-${Date.now()}` };
  },
});

const createSendGridSender = ({ env }) => {
  let cachedClient = null;
  const getClient = async () => {
    if (cachedClient) return cachedClient;
    const sgMailModule = await import('@sendgrid/mail');
    const sgMail = sgMailModule.default ?? sgMailModule;
    if (env.TWILIO_SENDGRID_API_KEY) sgMail.setApiKey(env.TWILIO_SENDGRID_API_KEY);
    cachedClient = sgMail;
    return sgMail;
  };

  return {
    async send({ to, subject, text, html, customArgs = {} }) {
      if (!env.TWILIO_SENDGRID_API_KEY || !env.TWILIO_SENDGRID_FROM_EMAIL) {
        logger.warn('SendGrid env missing; falling back to mock transactional email');
        return createMockSender().send({ to, subject });
      }
      try {
        const sg = await getClient();
        const message = {
          to,
          from: {
            email: env.TWILIO_SENDGRID_FROM_EMAIL,
            name: env.TWILIO_SENDGRID_FROM_NAME || env.APP_NAME || 'Cupcake',
          },
          subject,
          text,
          html,
          customArgs,
        };
        const response = await sg.send(message);
        const headers = Array.isArray(response) ? response[0]?.headers : response?.headers;
        const providerMessageId = headers?.['x-message-id'] ?? headers?.['X-Message-Id'] ?? null;
        return { success: true, providerMessageId };
      } catch (err) {
        return {
          success: false,
          providerMessageId: null,
          reason: err?.response?.statusCode ? `sendgrid_${err.response.statusCode}` : 'send_failed',
        };
      }
    },
  };
};

let cachedSender = null;
let cachedKey = null;

export const resolveTransactionalEmailSender = ({ env = loadEnv() } = {}) => {
  const key = env.EMAIL_PROVIDER ?? 'mock';
  if (cachedSender && cachedKey === key) return cachedSender;
  cachedSender = key === 'sendgrid' ? createSendGridSender({ env }) : createMockSender();
  cachedKey = key;
  return cachedSender;
};

export const setTransactionalEmailSender = (sender, key = 'mock') => {
  cachedSender = sender;
  cachedKey = key;
};

export const resetTransactionalEmailSender = () => {
  cachedSender = null;
  cachedKey = null;
};
