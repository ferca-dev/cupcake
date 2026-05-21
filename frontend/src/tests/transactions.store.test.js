import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useTransactionsStore } from '../stores/transactions.store.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const transactionFixture = (overrides = {}) => ({
  id: 'tx-1',
  tenantId: 'tenant-1',
  type: 'payment',
  status: 'paid',
  amount: 4900,
  currency: 'USD',
  provider: null,
  providerReference: null,
  description: 'Pro plan monthly subscription',
  planCode: 'pro_monthly',
  paidAt: '2026-05-01T00:00:00.000Z',
  initiatedBy: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  ...overrides,
});

describe('transactions store', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates the transactions list and pagination from the API', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [transactionFixture(), transactionFixture({ id: 'tx-2', type: 'refund' })],
          pagination: { page: 1, limit: 25, total: 2, totalPages: 1 },
        },
      }),
    );

    const store = useTransactionsStore();
    await store.fetchTransactions();
    expect(store.items).toHaveLength(2);
    expect(store.pagination.total).toBe(2);
    expect(store.isEmpty).toBe(false);
    expect(store.totalCount).toBe(2);
  });

  it('captures the load error without throwing past the caller', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'kaboom' } },
        { status: 500 },
      ),
    );
    const store = useTransactionsStore();
    await expect(store.fetchTransactions()).rejects.toThrow();
    expect(store.lastError).toBe('kaboom');
  });

  it('resets pagination to page 1 when a filter changes', async () => {
    const store = useTransactionsStore();
    store.pagination = { ...store.pagination, page: 3 };
    store.setFilter('status', 'paid');
    expect(store.filters.status).toBe('paid');
    expect(store.pagination.page).toBe(1);
  });

  it('hydrates the selected transaction', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { transaction: transactionFixture({ id: 'tx-detail' }) },
      }),
    );
    const store = useTransactionsStore();
    const tx = await store.fetchTransaction('tx-detail');
    expect(tx?.id).toBe('tx-detail');
    expect(store.selected?.id).toBe('tx-detail');
  });

  it('forwards filters and pagination to the request URL', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [],
          pagination: { page: 2, limit: 25, total: 0, totalPages: 1 },
        },
      }),
    );
    const store = useTransactionsStore();
    store.setFilter('status', 'paid');
    store.setFilter('type', 'payment');
    store.setPage(2);
    await store.fetchTransactions();
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('status=paid');
    expect(url).toContain('type=payment');
    expect(url).toContain('page=2');
  });

  it('clears state on reset', () => {
    const store = useTransactionsStore();
    store.items = [transactionFixture()];
    store.selected = transactionFixture();
    store.lastError = 'boom';
    store.setFilter('status', 'paid');
    store.reset();
    expect(store.items).toEqual([]);
    expect(store.selected).toBeNull();
    expect(store.lastError).toBeNull();
    expect(store.filters.status).toBe('');
  });
});
