import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useDashboardStore } from '../stores/dashboard.store.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const tenantSummary = () => ({
  surveys: { total: 4, active: 2, byStatus: { draft: 2, published: 2, paused: 0, archived: 0 } },
  responses: { total: 12 },
  campaigns: { total: 1, byStatus: { completed: 1 } },
  contacts: { total: 5, groups: 2 },
  channels: {
    totals: {
      email: { attempted: 5, sent: 3, failed: 1, skipped: 1, pending: 0 },
      sms: { attempted: 0, sent: 0, failed: 0, skipped: 0, pending: 0 },
      whatsapp: { attempted: 0, sent: 0, failed: 0, skipped: 0, pending: 0 },
    },
    skippedReasons: { missing_email: 1 },
  },
  recentSurveys: [],
  bestResponseSurveys: [],
  lowResponseSurveys: [],
  latestResponses: [],
});

const adminMetrics = () => ({
  clients: { total: 3, active: 2, suspended: 1, cancelled: 0, inactive: 1, byStatus: {} },
  users: { total: 5, byRole: { super_admin: 1, client_admin: 4 } },
  surveys: { total: 6, active: 3, byStatus: {} },
  responses: { total: 30 },
  campaigns: { total: 2, byStatus: {} },
  channels: [
    { channel: 'email', sent: 10, failed: 1, skipped: 2, attempted: 13 },
    { channel: 'sms', sent: 0, failed: 0, skipped: 0, attempted: 0 },
    { channel: 'whatsapp', sent: 0, failed: 0, skipped: 0, attempted: 0 },
  ],
  recentTransactions: [],
  recentTenants: [],
  recentActivity: [],
});

describe('dashboard store', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates the tenant-scoped summary', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { scope: 'tenant', summary: tenantSummary() } }),
    );
    const store = useDashboardStore();
    await store.fetchSummary();
    expect(store.scope).toBe('tenant');
    expect(store.isClientScope).toBe(true);
    expect(store.isGlobalScope).toBe(false);
    expect(store.summary?.responses.total).toBe(12);
    expect(store.summary?.channels.totals.email.sent).toBe(3);
  });

  it('switches to global scope when the API returns admin metrics', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { scope: 'global', summary: adminMetrics() } }),
    );
    const store = useDashboardStore();
    await store.fetchSummary();
    expect(store.scope).toBe('global');
    expect(store.isGlobalScope).toBe(true);
    expect(store.summary?.clients.total).toBe(3);
  });

  it('records a load error without throwing past the caller', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
        { status: 500 },
      ),
    );
    const store = useDashboardStore();
    await expect(store.fetchSummary()).rejects.toThrow();
    expect(store.lastError).toBe('boom');
  });

  it('fetches recent activity into the items array', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              id: '1',
              action: 'survey.created',
              entityType: 'survey',
              entityId: 'a',
              tenantId: 't',
              userId: 'u',
              createdAt: '2026-05-20T00:00:00.000Z',
            },
          ],
        },
      }),
    );
    const store = useDashboardStore();
    await store.fetchRecentActivity({ limit: 5 });
    expect(store.recentActivity).toHaveLength(1);
    expect(store.recentActivity[0].action).toBe('survey.created');
  });

  it('resets state when asked', async () => {
    const store = useDashboardStore();
    store.summary = tenantSummary();
    store.recentActivity = [{ id: '1', action: 'x' }];
    store.reset();
    expect(store.summary).toBeNull();
    expect(store.recentActivity).toEqual([]);
  });
});
