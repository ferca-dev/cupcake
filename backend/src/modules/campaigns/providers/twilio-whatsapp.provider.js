import { isValidPhoneLike, normalisePhone } from '../../contacts/contact.validation.js';
import { buildWhatsAppBody } from './provider.messages.js';
import {
  assertTwilioBaseEnv,
  createTwilioClient,
  normalizeTwilioFailure,
  resolveTwilioFrom,
} from './twilio.shared.js';

const PROVIDER_NAME = 'twilio-whatsapp';

/**
 * Twilio expects WhatsApp addresses prefixed with `whatsapp:`. We keep the
 * normalised E.164-style address inside the recipient record and only add the
 * prefix at the SDK boundary.
 */
const toWhatsAppAddress = (value) => {
  if (!value) return value;
  return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
};

export const createTwilioWhatsAppProvider = ({ env, client = null } = {}) => {
  assertTwilioBaseEnv(env, PROVIDER_NAME);
  const dispatch = resolveTwilioFrom({
    env,
    fromKey: 'TWILIO_WHATSAPP_FROM',
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
      if (!contact) return { ready: false, reason: 'missing_whatsapp_phone', recipient: null };
      if (contact.status === 'blocked') {
        return { ready: false, reason: 'contact_blocked', recipient: null };
      }
      if (contact.status === 'archived') {
        return { ready: false, reason: 'contact_archived', recipient: null };
      }
      const normalised = normalisePhone(contact.whatsappPhone ?? null);
      if (!normalised) {
        return { ready: false, reason: 'missing_whatsapp_phone', recipient: null };
      }
      if (!isValidPhoneLike(normalised)) {
        return { ready: false, reason: 'invalid_whatsapp_phone', recipient: null };
      }
      return { ready: true, reason: null, recipient: normalised };
    },

    async send(payload) {
      const twilioClient = await getClient();
      const body = buildWhatsAppBody(payload);
      const params = {
        to: toWhatsAppAddress(payload.recipient),
        body,
      };
      if (dispatch.from) params.from = toWhatsAppAddress(dispatch.from);
      if (dispatch.messagingServiceSid) {
        params.messagingServiceSid = dispatch.messagingServiceSid;
      }
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
