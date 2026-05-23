import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useBillingPaymentsStore } from '../stores/billing-payments.store.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const paymentFixture = (overrides = {}) => ({
  id: 'pay-1',
  tenantId: 'tenant-1',
  provider: 'mercadopago',
  purpose: 'token_package',
  status: 'pending',
  amountMinor: 9900,
  currency: 'USD',
  packageId: 'pkg-1',
  packageName: 'Pro pack',
  tokensToCredit: 1000,
  tokenCredited: false,
  externalReference: 'cupcake_tokens_1',
  providerPreferenceId: 'pref-1',
  initPoint: 'https://mock/checkout/pref-1',
  ...overrides,
});

const subscriptionFixture = (overrides = {}) => ({
  id: 'sub-1',
  tenantId: 'tenant-1',
  planId: 'plan-1',
  planCode: 'pro_monthly',
  planNameSnapshot: 'Pro monthly',
  status: 'authorized',
  priceMinor: 4900,
  currency: 'USD',
  mercadoPagoPreapprovalId: 'preapp-1',
  nextChargeAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

describe('billing payments store', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a Mercado Pago preference and prepends the pending transaction to the list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          transaction: paymentFixture(),
          preference: {
            id: 'pref-1',
            initPoint: 'https://mock/checkout/pref-1',
            sandboxInitPoint: null,
            externalReference: 'cupcake_tokens_1',
          },
        },
      }),
    );
    const store = useBillingPaymentsStore();
    const result = await store.createPreference('pkg-1');
    expect(result.preference.id).toBe('pref-1');
    expect(store.latestPreference?.id).toBe('pref-1');
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0].id).toBe('pay-1');
  });

  it('hydrates subscriptions and exposes the active subscription getter', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [
            subscriptionFixture({ id: 'sub-cancelled', status: 'cancelled' }),
            subscriptionFixture(),
          ],
          pagination: { page: 1, limit: 25, total: 2, totalPages: 1 },
        },
      }),
    );
    const store = useBillingPaymentsStore();
    await store.fetchSubscriptions();
    expect(store.subscriptions).toHaveLength(2);
    expect(store.activeSubscription?.id).toBe('sub-1');
  });

  it('captures the last error when the API rejects a subscription create', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: { code: 'CONFLICT_ERROR', message: 'Already subscribed', details: [] },
        },
        { status: 409 },
      ),
    );
    const store = useBillingPaymentsStore();
    await expect(store.createSubscription('plan-1')).rejects.toThrow();
    expect(store.lastError).toMatch(/Already subscribed/);
  });
});
