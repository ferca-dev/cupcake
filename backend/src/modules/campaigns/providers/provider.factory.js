import { disabledFeatureError } from '../../../common/middlewares/surveys-only.js';
import { loadEnv } from '../../../config/env.js';
import { createMockEmailProvider } from './mock-email.provider.js';
import { createMockSmsProvider } from './mock-sms.provider.js';
import { createMockWhatsappProvider } from './mock-whatsapp.provider.js';
import { createTwilioSmsProvider } from './twilio-sms.provider.js';
import { createTwilioWhatsAppProvider } from './twilio-whatsapp.provider.js';
import { createTwilioSendGridEmailProvider } from './twilio-sendgrid-email.provider.js';

const EMAIL_PROVIDERS = {
  mock: () => createMockEmailProvider(),
  sendgrid: ({ env }) => createTwilioSendGridEmailProvider({ env }),
};

const SMS_PROVIDERS = {
  mock: () => createMockSmsProvider(),
  twilio: ({ env }) => createTwilioSmsProvider({ env }),
};

const WHATSAPP_PROVIDERS = {
  mock: () => createMockWhatsappProvider(),
  twilio: ({ env }) => createTwilioWhatsAppProvider({ env }),
};

const resolve = (registry, key, channelLabel, ctx) => {
  const factory = registry[key];
  if (!factory) {
    const supported = Object.keys(registry).join(', ');
    throw new Error(`Unknown ${channelLabel} provider "${key}". Supported values: ${supported}`);
  }
  return factory(ctx);
};

/**
 * Selects messaging providers based on environment configuration. Returning
 * a per-call snapshot keeps the campaign service free of singleton state — in
 * tests we can override `EMAIL_PROVIDER` etc. and call this again to get a
 * fresh provider trio. Real providers fail-fast when their required env vars
 * are missing (e.g. `TWILIO_ACCOUNT_SID`), which surfaces a misconfigured
 * deployment at boot rather than mid-campaign.
 */
export const resolveProviders = ({ env = loadEnv() } = {}) => {
  if (env.SURVEYS_ONLY) throw disabledFeatureError();
  return {
    email: resolve(EMAIL_PROVIDERS, env.EMAIL_PROVIDER, 'email', { env }),
    sms: resolve(SMS_PROVIDERS, env.SMS_PROVIDER, 'SMS', { env }),
    whatsapp: resolve(WHATSAPP_PROVIDERS, env.WHATSAPP_PROVIDER, 'WhatsApp', { env }),
  };
};

export const __testing = {
  EMAIL_PROVIDERS,
  SMS_PROVIDERS,
  WHATSAPP_PROVIDERS,
};
