import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useReportsStore } from '../stores/reports.store.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const overviewPayload = () => ({
  surveyId: 'survey-1',
  totals: {
    totalResponses: 10,
    completedResponses: 10,
    audienceSize: 25,
    sentCount: 20,
    deliveredCount: 18,
    openedCount: 10,
    clickedCount: 5,
    failedCount: 1,
    skippedCount: 4,
    pendingCount: 0,
    anonymousResponses: 2,
  },
  rates: {
    responseRate: 0.4,
    completionRate: 0.5,
    deliveryRate: 0.9,
    openRate: 0.5,
    clickRate: 0.25,
  },
  duration: { count: 10, averageSeconds: 75 },
});

describe('reports store', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the overview report and exposes it on state', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { report: overviewPayload() } }),
    );
    const store = useReportsStore();
    store.setSurvey('survey-1');
    await store.fetchOverview();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/surveys/survey-1/reports/overview');
    expect(store.overview.totals.totalResponses).toBe(10);
    expect(store.errors.overview).toBeNull();
  });

  it('serialises active filters into the request URL', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { report: overviewPayload() } }),
    );
    const store = useReportsStore();
    store.setSurvey('survey-1');
    store.setFilters({ from: '2026-01-01', channel: 'email' });
    await store.fetchOverview();
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('from=2026-01-01');
    expect(calledUrl).toContain('channel=email');
    // Empty filters should not pollute the query string.
    expect(calledUrl).not.toContain('campaignId=');
  });

  it('captures errors per report key without throwing past the caller', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
        { status: 500 },
      ),
    );
    const store = useReportsStore();
    store.setSurvey('survey-1');
    await expect(store.fetchChannels()).rejects.toThrow();
    expect(store.errors.channels).toBe('boom');
    expect(store.channels).toBeNull();
  });

  it('clears previous data when the survey id changes', () => {
    const store = useReportsStore();
    store.setSurvey('survey-1');
    store.overview = overviewPayload();
    store.setSurvey('survey-2');
    expect(store.overview).toBeNull();
    expect(store.surveyId).toBe('survey-2');
  });

  it('builds an export URL with the active filters applied', () => {
    const store = useReportsStore();
    store.setSurvey('survey-1');
    store.setFilters({ channel: 'sms', from: '2026-03-01' });
    const url = store.exportUrl({ type: 'questions', format: 'csv' });
    expect(url).toContain('/surveys/survey-1/reports/export');
    expect(url).toContain('type=questions');
    expect(url).toContain('format=csv');
    expect(url).toContain('channel=sms');
  });
});
