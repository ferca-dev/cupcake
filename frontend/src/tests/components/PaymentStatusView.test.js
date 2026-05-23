import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import PaymentStatusView from '../../views/billing/PaymentStatusView.vue';
import { setAuthProvider } from '../../services/apiClient.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const payment = {
  id: 'pay-1',
  externalReference: 'cupcake_tokens_ref',
  providerPreferenceId: 'pref-1',
  status: 'pending',
  tokensToCredit: 1000,
};

const buildRouter = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/billing/payment/success',
        name: 'billing.payment.success',
        component: PaymentStatusView,
        props: { outcome: 'success' },
      },
    ],
  });
  await router.push('/billing/payment/success?external_reference=cupcake_tokens_ref');
  await router.isReady();
  return router;
};

beforeEach(() => {
  setActivePinia(createPinia());
  setAuthProvider(null);
});

describe('PaymentStatusView', () => {
  it('treats Mercado Pago redirects as read-only payment lookups', async () => {
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init = {}) => {
        calls.push({ url: url.toString(), method: init.method ?? 'GET', body: init.body });
        if (url.toString().includes('/billing/payments/pay-1')) {
          return jsonResponse({ success: true, data: { payment } });
        }
        return jsonResponse({
          success: true,
          data: { items: [payment], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } },
        });
      }),
    );

    const router = await buildRouter();
    const wrapper = mount(PaymentStatusView, {
      props: { outcome: 'success' },
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('cupcake_tokens_ref');
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
    expect(calls.some((call) => call.body)).toBe(false);
  });
});
