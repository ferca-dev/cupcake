import { isValidPhoneLike, normalisePhone } from '../../contacts/contact.validation.js';
import { buildSmsBody } from './provider.messages.js';
import {
  assertTwilioBaseEnv,
  createTwilioClient,
  normalizeTwilioFailure,
  resolveTwilioFrom,
} from './twilio.shared.js';

const PROVIDER_NAME = 'twilio-sms';

/**
 * Twilio SMS provider. Lives behind the same provider interface as the mock
 * provider so the campaign service never reaches into the Twilio SDK. The
 * client is constructed lazily on the first send because creating it forces a
 * runtime check of `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
 *
 * @param {object} deps
 * @param {object} deps.env - Validated env (typically `loadEnv()` output).
 * @param {object} [deps.client] - Optional pre-built Twilio client for tests.
 */
export const createTwilioSmsProvider = ({ env, client = null } = {}) => {
  assertTwilioBaseEnv(env, PROVIDER_NAME);
  const dispatch = resolveTwilioFrom({
    env,
    fromKey: 'TWILIO_SMS_FROM',
    providerName: PROVIDER_NAME,
  });

  let cachedClient = client;
  const getClient = async () => {
    if (!cachedClient) cachedClient = await createTwilioClient({ env });
    return cachedClient;
  };

  return {
    getProviderName() {
      return PROVIDER_NAME;
    },

    validateRecipient(contact) {
      if (!contact) return { ready: false, reason: 'missing_phone', recipient: null };
      if (contact.status === 'blocked') {
        return { ready: false, reason: 'contact_blocked', recipient: null };
      }
      if (contact.status === 'archived') {
        return { ready: false, reason: 'contact_archived', recipient: null };
      }
      const normalised = normalisePhone(contact.phone ?? null);
      if (!normalised) return { ready: false, reason: 'missing_phone', recipient: null };
      if (!isValidPhoneLike(normalised)) {
        return { ready: false, reason: 'invalid_phone', recipient: null };
      }
      return { ready: true, reason: null, recipient: normalised };
    },

    async send(payload) {
      const twilioClient = await getClient();
      const body = buildSmsBody(payload);
      const params = { to: payload.recipient, body };
      if (dispatch.from) params.from = dispatch.from;
      if (dispatch.messagingServiceSid) params.messagingServiceSid = dispatch.messagingServiceSid;
      if (env.TWILIO_STATUS_CALLBACK_URL) {
        params.statusCallback = env.TWILIO_STATUS_CALLBACK_URL;
      }

      try {
        const message = await twilioClient.messages.create(params);
        const status = message?.status ?? null;
        if (status === 'failed' || status === 'undelivered') {
          return {
            success: false,
            provider: PROVIDER_NAME,
            providerMessageId: message?.sid ?? null,
            reason: normalizeTwilioFailure({ status, code: message?.errorCode ?? null }),
          };
        }
        return {
          success: true,
          provider: PROVIDER_NAME,
          providerMessageId: message?.sid ?? null,
          reason: null,
        };
      } catch (err) {
        return {
          success: false,
          provider: PROVIDER_NAME,
          providerMessageId: null,
          reason: normalizeTwilioFailure({
            code: err?.code ?? null,
            status: err?.status ?? null,
            message: err?.message ?? null,
          }),
        };
      }
    },
  };
};
