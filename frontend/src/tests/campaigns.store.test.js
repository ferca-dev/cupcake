import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useCampaignsStore } from '../stores/campaigns.store.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const campaignFixture = (overrides = {}) => ({
  id: 'campaign-1',
  tenantId: 'tenant-1',
  surveyId: 'survey-1',
  surveyVersionId: 'version-1',
  name: 'Quarterly NPS',
  channels: ['email'],
  target: { contactIds: ['c1'], groupIds: [] },
  summary: {
    selectedCount: 1,
    validCount: 1,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    skippedReasons: {},
  },
  status: 'draft',
  createdBy: 'user-1',
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  ...overrides,
});

describe('campaigns store', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates campaigns and pagination from the API', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [campaignFixture()],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        },
      }),
    );

    const store = useCampaignsStore();
    await store.fetchCampaigns();
    expect(store.campaigns).toHaveLength(1);
    expect(store.pagination.total).toBe(1);
  });

  it('prepends a created campaign to the local cache', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { campaign: campaignFixture({ id: 'new' }) } }),
    );
    const store = useCampaignsStore();
    store.campaigns = [campaignFixture({ id: 'old' })];
    const created = await store.createCampaign({
      name: 'New',
      surveyId: 'survey-1',
      channels: ['email'],
      target: { contactIds: ['c1'] },
    });
    expect(created.id).toBe('new');
    expect(store.campaigns[0].id).toBe('new');
  });

  it('refreshes the detail bundle after sending a campaign', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            campaign: campaignFixture({ status: 'completed' }),
            summary: {
              selectedCount: 1,
              validCount: 1,
              sentCount: 1,
              failedCount: 0,
              skippedCount: 0,
              skippedReasons: {},
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { campaign: campaignFixture({ status: 'completed' }) },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { items: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 1 } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            report: {
              campaignId: 'campaign-1',
              status: 'completed',
              selectedCount: 1,
              validCount: 1,
              counts: {
                pending: 0,
                sent: 1,
                failed: 0,
                skipped: 0,
                delivered: 0,
                opened: 0,
                clicked: 0,
              },
              skippedReasons: {},
              startedAt: null,
              completedAt: null,
            },
          },
        }),
      );

    const store = useCampaignsStore();
    await store.sendCampaign('campaign-1');
    expect(store.currentCampaign?.status).toBe('completed');
    expect(store.currentReport?.counts.sent).toBe(1);
  });
});
