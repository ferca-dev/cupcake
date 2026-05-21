import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useTemplatesStore } from '../stores/templates.store.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const sampleTemplate = (overrides = {}) => ({
  id: 'tpl_1',
  tenantId: null,
  title: 'NPS',
  description: 'Net Promoter Score',
  category: 'nps',
  schema: { fields: [], sections: [], logicRules: [], layout: { mode: 'single_page' } },
  isSystemTemplate: true,
  status: 'active',
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  ...overrides,
});

describe('templates store', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates templates and exposes the systemTemplates / tenantTemplates split', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [
            sampleTemplate({ id: 'tpl_1', isSystemTemplate: true, tenantId: null }),
            sampleTemplate({
              id: 'tpl_2',
              isSystemTemplate: false,
              tenantId: 'tenant_a',
              title: 'My internal',
            }),
          ],
          pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
        },
      }),
    );

    const store = useTemplatesStore();
    await store.fetchTemplates();
    expect(store.items).toHaveLength(2);
    expect(store.systemTemplates).toHaveLength(1);
    expect(store.tenantTemplates).toHaveLength(1);
    expect(store.byCategory.get('nps')).toHaveLength(2);
  });

  it('captures a load error without throwing past the caller', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
        { status: 500 },
      ),
    );
    const store = useTemplatesStore();
    await expect(store.fetchTemplates()).rejects.toThrow();
    expect(store.lastError).toBe('boom');
  });

  it('prepends a newly created template to the items list', async () => {
    const created = sampleTemplate({ id: 'tpl_new', title: 'Brand new' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { template: created } }, { status: 201 }),
    );
    const store = useTemplatesStore();
    store.items = [sampleTemplate({ id: 'tpl_old' })];
    const result = await store.createTemplate({
      title: 'Brand new',
      schema: { fields: [] },
    });
    expect(result).toEqual(created);
    expect(store.items[0].id).toBe('tpl_new');
  });

  it('updates the matching item after PUT', async () => {
    const updated = sampleTemplate({ id: 'tpl_1', title: 'Renamed' });
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { template: updated } }));
    const store = useTemplatesStore();
    store.items = [sampleTemplate({ id: 'tpl_1' }), sampleTemplate({ id: 'tpl_2' })];
    await store.updateTemplate('tpl_1', { title: 'Renamed' });
    expect(store.items.find((t) => t.id === 'tpl_1')?.title).toBe('Renamed');
  });

  it('removes an item after DELETE', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'tpl_1' } }));
    const store = useTemplatesStore();
    store.items = [sampleTemplate({ id: 'tpl_1' }), sampleTemplate({ id: 'tpl_2' })];
    await store.deleteTemplate('tpl_1');
    expect(store.items.map((t) => t.id)).toEqual(['tpl_2']);
  });

  it('returns the created survey when instantiating from a template', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          success: true,
          data: {
            survey: {
              id: 'sv_new',
              tenantId: 'tenant_a',
              title: 'NPS',
              slug: 'nps',
              status: 'draft',
              currentDraftSchema: { fields: [] },
            },
          },
        },
        { status: 201 },
      ),
    );
    const store = useTemplatesStore();
    const survey = await store.createSurveyFromTemplate('tpl_1', { title: 'NPS' });
    expect(survey?.id).toBe('sv_new');
    expect(survey?.status).toBe('draft');
  });

  it('resets store state', () => {
    const store = useTemplatesStore();
    store.items = [sampleTemplate()];
    store.selected = sampleTemplate();
    store.reset();
    expect(store.items).toEqual([]);
    expect(store.selected).toBeNull();
  });
});
