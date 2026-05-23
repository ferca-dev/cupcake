import { loadEnv } from '../../../config/env.js';
import { createMercadoPagoProvider } from './mercadopago.provider.js';
import { createMockPaymentProvider } from './mock-payment.provider.js';

const PROVIDERS = {
  mock: ({ env }) => createMockPaymentProvider({ env }),
  mercadopago: ({ env }) => createMercadoPagoProvider({ env }),
};

let cachedProvider = null;
let cachedKey = null;

/**
 * Resolve the active payment provider from the environment. We keep a cached
 * instance keyed by the env value so the SDK client is reused across requests,
 * which matters for the real Mercado Pago provider — building a new
 * `MercadoPagoConfig` for every request would re-establish HTTPS connections.
 */
export const resolvePaymentProvider = ({ env = loadEnv() } = {}) => {
  const key = env.PAYMENT_PROVIDER ?? 'mock';
  if (cachedProvider && cachedKey === key) return cachedProvider;
  const factory = PROVIDERS[key];
  if (!factory) {
    const supported = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Unknown payment provider "${key}". Supported values: ${supported}`);
  }
  cachedProvider = factory({ env });
  cachedKey = key;
  return cachedProvider;
};

/**
 * Test/override hook. Tests can inject a deterministic provider implementation
 * without touching environment variables.
 */
export const setPaymentProvider = (instance, key = 'mock') => {
  cachedProvider = instance;
  cachedKey = key;
};

export const resetPaymentProvider = () => {
  cachedProvider = null;
  cachedKey = null;
};

export const __testing = { PROVIDERS };
