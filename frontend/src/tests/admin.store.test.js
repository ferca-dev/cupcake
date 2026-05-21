import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useAdminStore } from '../stores/admin.store.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const sampleTenant = (overrides = {}) => ({
  id: 'tenant_1',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'user_1',
  status: 'active',
  planId: null,
  settings: { timezone: 'UTC', locale: 'en-US', branding: {} },
  userCount: 3,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  ...overrides,
});

describe('admin store', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads tenants and exposes status counts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [
            sampleTenant({ id: 't1', status: 'active' }),
            sampleTenant({ id: 't2', status: 'suspended' }),
            sampleTenant({ id: 't3', status: 'cancelled' }),
          ],
          pagination: { page: 1, limit: 25, total: 3, totalPages: 1 },
        },
      }),
    );

    const store = useAdminStore();
    await store.fetchTenants();
    expect(store.tenants).toHaveLength(3);
    expect(store.totalTenants).toBe(3);
    expect(store.activeTenants).toBe(1);
    expect(store.suspendedTenants).toBe(1);
    expect(store.cancelledTenants).toBe(1);
  });

  it('forwards search and status filters through the list query', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } },
      }),
    );
    const store = useAdminStore();
    await store.fetchTenants({ search: 'beta', status: 'suspended' });
    const call = fetchMock.mock.calls[0];
    const url = String(call[0]);
    expect(url).toContain('search=beta');
    expect(url).toContain('status=suspended');
  });

  it('prepends a newly created tenant to the list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: true, data: { tenant: sampleTenant({ id: 'new_tenant', name: 'Gamma' }) } },
        { status: 201 },
      ),
    );
    const store = useAdminStore();
    store.tenants = [sampleTenant({ id: 'old' })];
    store.pagination = { page: 1, limit: 25, total: 1, totalPages: 1 };
    const created = await store.createTenant({ name: 'Gamma' });
    expect(created?.id).toBe('new_tenant');
    expect(store.tenants[0].id).toBe('new_tenant');
    expect(store.pagination.total).toBe(2);
  });

  it('applies tenant patches to the list and the selected detail', async () => {
    const updated = sampleTenant({ id: 't1', status: 'suspended' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          tenant: updated,
          changed: true,
          previousStatus: 'active',
          affectedUsers: 0,
          revokedTokens: 2,
        },
      }),
    );
    const store = useAdminStore();
    store.tenants = [sampleTenant({ id: 't1' }), sampleTenant({ id: 't2' })];
    store.selectedTenant = sampleTenant({ id: 't1' });
    await store.updateTenantStatus('t1', { status: 'suspended' });
    expect(store.tenants.find((t) => t.id === 't1')?.status).toBe('suspended');
    expect(store.selectedTenant?.status).toBe('suspended');
  });

  it('captures errors without throwing past the caller', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
        { status: 500 },
      ),
    );
    const store = useAdminStore();
    await expect(store.fetchTenants()).rejects.toThrow();
    expect(store.lastError).toBe('boom');
  });

  it('fetches global metrics', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { metrics: { clients: { total: 1 } } },
      }),
    );
    const store = useAdminStore();
    const metrics = await store.fetchMetrics();
    expect(metrics?.clients?.total).toBe(1);
    expect(store.metrics?.clients?.total).toBe(1);
  });

  it('lists tenant users into the selectedUsers slot', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          tenantId: 't1',
          items: [
            { id: 'u1', name: 'A', email: 'a@x.test', role: 'client_admin', status: 'active' },
          ],
        },
      }),
    );
    const store = useAdminStore();
    const users = await store.fetchTenantUsers('t1');
    expect(users).toHaveLength(1);
    expect(store.selectedUsers[0].email).toBe('a@x.test');
  });

  it('resets store state', () => {
    const store = useAdminStore();
    store.tenants = [sampleTenant()];
    store.selectedTenant = sampleTenant();
    store.selectedUsers = [{ id: 'u1' }];
    store.metrics = { clients: { total: 1 } };
    store.reset();
    expect(store.tenants).toEqual([]);
    expect(store.selectedTenant).toBeNull();
    expect(store.selectedUsers).toEqual([]);
    expect(store.metrics).toBeNull();
  });
});
