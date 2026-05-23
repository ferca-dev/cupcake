import crypto from 'node:crypto';

import {
  normalizePaymentStatus,
  normalizePreapprovalStatus,
  normalizeAuthorizedPaymentStatus,
} from './provider.types.js';
import { logger } from '../../../common/utils/logger.js';

const PROVIDER_NAME = 'mercadopago';

const REQUIRED_ENV = ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_PUBLIC_KEY'];

export class MercadoPagoConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MercadoPagoConfigurationError';
  }
}

const assertEnv = (env) => {
  const missing = REQUIRED_ENV.filter((k) => !env?.[k]);
  if (missing.length > 0) {
    throw new MercadoPagoConfigurationError(
      `mercadopago provider requires ${missing.join(', ')} to be set`,
    );
  }
};

const toMinor = (major) => Math.round(Number(major ?? 0) * 100);
const toMajor = (minor) => Number(minor ?? 0) / 100;

/**
 * Compute the HMAC-SHA256 signature Mercado Pago expects on incoming webhook
 * deliveries. The header format is:
 *
 *   x-signature: ts=<ts>,v1=<hex>
 *
 * and the signed manifest is
 *
 *   id:<resource id>;request-id:<x-request-id>;ts:<ts>;
 *
 * Documented at https://www.mercadopago.com/developers/en/docs/your-integrations/notifications/webhooks#editor_4.
 */
const verifySignature = ({ secret, signatureHeader, requestId, dataId }) => {
  if (!secret) return false;
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=').map((p) => p?.trim());
    if (key && value) acc[key] = value;
    return acc;
  }, {});
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId ?? ''};request-id:${requestId ?? ''};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
};

/**
 * Real Mercado Pago adapter. The SDK (`mercadopago` v2) is imported lazily so
 * the mock pipeline never pulls it in. Each method maps the SDK response onto
 * the provider interface (see `provider.types.js`) so the rest of the payment
 * module stays free of vendor types.
 */
export const createMercadoPagoProvider = ({ env, sdk = null, fetchImpl = null } = {}) => {
  assertEnv(env);

  let cached = sdk;
  const getSdk = async () => {
    if (cached) return cached;
    const mod = await import('mercadopago');
    const { MercadoPagoConfig, Preference, Payment, PreApproval } = mod;
    const client = new MercadoPagoConfig({
      accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
      options: { timeout: 10000 },
    });
    cached = {
      preference: new Preference(client),
      payment: new Payment(client),
      preapproval: new PreApproval(client),
      raw: client,
    };
    return cached;
  };

  // Authorized payments are not yet covered by the SDK helpers we use, so fall
  // back to a direct API call.
  const fetchJson = async (url) => {
    const httpClient = fetchImpl ?? globalThis.fetch;
    const res = await httpClient(url, {
      headers: {
        Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Mercado Pago API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  };

  return {
    getProviderName() {
      return PROVIDER_NAME;
    },

    async createTokenPackagePreference(input) {
      const sdk = await getSdk();
      const body = {
        items: [
          {
            id: input.externalReference,
            title: input.title,
            description: input.description ?? input.title,
            quantity: input.quantity ?? 1,
            currency_id: input.currency,
            unit_price: Number(input.unitPriceMajor),
          },
        ],
        external_reference: input.externalReference,
        notification_url: env.MERCADOPAGO_NOTIFICATION_URL,
        back_urls: {
          success: env.MERCADOPAGO_SUCCESS_URL,
          failure: env.MERCADOPAGO_FAILURE_URL,
          pending: env.MERCADOPAGO_PENDING_URL,
        },
        auto_return: 'approved',
        statement_descriptor: env.MERCADOPAGO_STATEMENT_DESCRIPTOR,
        metadata: input.metadata ?? {},
        ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
      };
      const response = await sdk.preference.create({ body });
      return {
        preferenceId: response.id,
        initPoint: response.init_point ?? response.sandbox_init_point ?? null,
        sandboxInitPoint: response.sandbox_init_point ?? null,
        raw: response,
      };
    },

    async fetchPayment(paymentId) {
      const sdk = await getSdk();
      const raw = await sdk.payment.get({ id: paymentId });
      return {
        id: String(raw.id ?? paymentId),
        status: normalizePaymentStatus(raw.status),
        rawStatus: raw.status,
        externalReference: raw.external_reference ?? null,
        amountMinor: raw.transaction_amount ? toMinor(raw.transaction_amount) : null,
        currency: raw.currency_id ?? null,
        payerEmail: raw.payer?.email ?? null,
        preferenceId: raw.preference_id ?? null,
        paidAt: raw.date_approved ?? null,
        raw,
      };
    },

    async createPreapproval(input) {
      const sdk = await getSdk();
      const body = {
        external_reference: input.externalReference,
        reason: input.reason,
        payer_email: input.payerEmail,
        back_url: input.backUrl ?? env.MERCADOPAGO_SUCCESS_URL,
        auto_recurring: {
          frequency: input.frequency,
          frequency_type: input.frequencyType,
          transaction_amount: Number(input.amountMajor),
          currency_id: input.currency,
        },
        notification_url: env.MERCADOPAGO_NOTIFICATION_URL,
        status: 'pending',
        ...(input.planId ? { preapproval_plan_id: input.planId } : {}),
      };
      const response = await sdk.preapproval.create({ body });
      return {
        preapprovalId: String(response.id),
        initPoint: response.init_point ?? null,
        status: normalizePreapprovalStatus(response.status),
        raw: response,
      };
    },

    async fetchPreapproval(preapprovalId) {
      const sdk = await getSdk();
      const raw = await sdk.preapproval.get({ id: preapprovalId });
      return {
        id: String(raw.id),
        status: normalizePreapprovalStatus(raw.status),
        rawStatus: raw.status,
        externalReference: raw.external_reference ?? null,
        payerEmail: raw.payer_email ?? null,
        amountMinor: raw.auto_recurring?.transaction_amount
          ? toMinor(raw.auto_recurring.transaction_amount)
          : null,
        currency: raw.auto_recurring?.currency_id ?? null,
        nextPaymentDate: raw.next_payment_date ? new Date(raw.next_payment_date) : null,
        raw,
      };
    },

    async updatePreapprovalStatus(preapprovalId, status) {
      const sdk = await getSdk();
      const response = await sdk.preapproval.update({
        id: preapprovalId,
        body: { status },
      });
      return {
        id: String(response.id),
        status: normalizePreapprovalStatus(response.status),
        rawStatus: response.status,
        externalReference: response.external_reference ?? null,
        payerEmail: response.payer_email ?? null,
        amountMinor: response.auto_recurring?.transaction_amount
          ? toMinor(response.auto_recurring.transaction_amount)
          : null,
        currency: response.auto_recurring?.currency_id ?? null,
        nextPaymentDate: response.next_payment_date ? new Date(response.next_payment_date) : null,
        raw: response,
      };
    },

    async fetchAuthorizedPayment(authorizedPaymentId) {
      const raw = await fetchJson(
        `https://api.mercadopago.com/authorized_payments/${authorizedPaymentId}`,
      );
      return {
        id: String(raw.id ?? authorizedPaymentId),
        status: normalizeAuthorizedPaymentStatus(raw.status),
        rawStatus: raw.status,
        preapprovalId: raw.preapproval_id ?? null,
        amountMinor: raw.transaction_amount ? toMinor(raw.transaction_amount) : null,
        currency: raw.currency_id ?? null,
        paymentDate: raw.payment_date ? new Date(raw.payment_date) : null,
        periodStart: raw.debit_date ? new Date(raw.debit_date) : null,
        periodEnd: raw.next_payment_date ? new Date(raw.next_payment_date) : null,
        paymentId: raw.payment?.id ? String(raw.payment.id) : null,
        raw,
      };
    },

    verifyWebhookSignature(_payload, headers) {
      if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
        // No secret configured — treat as "verification disabled". The caller
        // decides whether to refuse processing in production.
        logger.warn('MERCADOPAGO_WEBHOOK_SECRET is empty; skipping signature verification');
        return null;
      }
      const signature = headers['x-signature'] ?? headers['X-Signature'] ?? null;
      const requestId = headers['x-request-id'] ?? headers['X-Request-Id'] ?? null;
      const dataId =
        headers['x-resource-id'] ??
        headers['X-Resource-Id'] ??
        headers['data.id'] ??
        headers['data-id'] ??
        null;
      return verifySignature({
        secret: env.MERCADOPAGO_WEBHOOK_SECRET,
        signatureHeader: signature,
        requestId,
        dataId,
      });
    },
  };
};

export const __testing = { verifySignature, toMinor, toMajor };
