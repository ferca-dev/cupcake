import { loadEnv } from '../../../config/env.js';
import { createMockEmailProvider } from './mock-email.provider.js';
import { createMockSmsProvider } from './mock-sms.provider.js';
import { createMockWhatsappProvider } from './mock-whatsapp.provider.js';

const EMAIL_PROVIDERS = {
  mock: createMockEmailProvider,
};

const SMS_PROVIDERS = {
  mock: createMockSmsProvider,
};

const WHATSAPP_PROVIDERS = {
  mock: createMockWhatsappProvider,
};

const resolve = (registry, key, fallbackKey = 'mock') => {
  const factory = registry[key] ?? registry[fallbackKey];
  if (!factory) {
    throw new Error(`No provider factory registered for "${key}"`);
  }
  return factory();
};

/**
 * Selects messaging providers based on environment configuration. Returning
 * a per-call snapshot keeps the campaign service free of singleton state — in
 * tests we can override `EMAIL_PROVIDER` etc. and call this again to get a
 * fresh provider trio.
 */
export const resolveProviders = ({ env = loadEnv() } = {}) => ({
  email: resolve(EMAIL_PROVIDERS, env.EMAIL_PROVIDER),
  sms: resolve(SMS_PROVIDERS, env.SMS_PROVIDER),
  whatsapp: resolve(WHATSAPP_PROVIDERS, env.WHATSAPP_PROVIDER),
});

export const __testing = {
  EMAIL_PROVIDERS,
  SMS_PROVIDERS,
  WHATSAPP_PROVIDERS,
};
