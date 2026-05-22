import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useBuilderStore } from '../stores/builder.store.js';

const buildJsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const surveyFixture = (overrides = {}) => ({
  id: 'survey-1',
  tenantId: 'tenant-1',
  title: 'Demo survey',
  description: null,
  slug: 'demo-survey',
  status: 'draft',
  currentDraftSchema: {
    fields: [],
    sections: [],
    logicRules: [],
    layout: { mode: 'single_page', showProgress: true },
  },
  publishedVersionId: null,
  settings: {},
  createdBy: 'user-1',
  updatedBy: null,
  publishedAt: null,
  archivedAt: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  ...overrides,
});

describe('builder store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('schema manipulation', () => {
    it('adds a field with default props and selects it', () => {
      const builder = useBuilderStore();
      const field = builder.addField('short_text');
      expect(builder.schema.fields).toHaveLength(1);
      expect(builder.selectedFieldId).toBe(field.id);
      expect(builder.isDirty).toBe(true);
      expect(field.key).toMatch(/^[a-z0-9_]+$/);
    });

    it('removes a field and falls back to a sensible neighbour selection', () => {
      const builder = useBuilderStore();
      const a = builder.addField('short_text');
      const b = builder.addField('email');
      builder.selectField(a.id);
      builder.removeField(a.id);
      expect(builder.schema.fields).toHaveLength(1);
      expect(builder.selectedFieldId).toBe(b.id);
    });

    it('duplicates a field with a new id and uniquified key', () => {
      const builder = useBuilderStore();
      const original = builder.addField('short_text');
      builder.updateField(original.id, { key: 'customer' });
      const copy = builder.duplicateField(original.id);
      expect(copy).not.toBeNull();
      expect(copy.id).not.toBe(original.id);
      expect(copy.key).not.toBe(original.key);
      expect(builder.schema.fields).toHaveLength(2);
      // Copy must come right after the source.
      expect(builder.schema.fields[1].id).toBe(copy.id);
    });

    it('updates a field while ignoring unknown payload keys', () => {
      const builder = useBuilderStore();
      const f = builder.addField('short_text');
      builder.updateField(f.id, { label: 'Name', evil: 'no', required: true });
      const current = builder.schema.fields.find((field) => field.id === f.id);
      expect(current.label).toBe('Name');
      expect(current.required).toBe(true);
      expect('evil' in current).toBe(false);
    });

    it('stores uploaded image asset references on image blocks', () => {
      const builder = useBuilderStore();
      const image = builder.addField('image_block');
      builder.updateField(image.id, {
        settings: {
          width: 'half',
          imageUrl: 'http://localhost:4000/uploads/tenants/t/surveys/pixel.png',
          mediaAssetId: '665000000000000000000001',
        },
      });

      expect(builder.schema.fields[0].settings).toMatchObject({
        width: 'half',
        imageUrl: 'http://localhost:4000/uploads/tenants/t/surveys/pixel.png',
        mediaAssetId: '665000000000000000000001',
      });
    });

    it('reorders fields and refreshes order numbers', () => {
      const builder = useBuilderStore();
      const a = builder.addField('short_text');
      const b = builder.addField('email');
      const c = builder.addField('number');
      builder.reorderFields(0, 2);
      const ids = builder.schema.fields.map((field) => field.id);
      expect(ids).toEqual([b.id, c.id, a.id]);
      expect(builder.schema.fields.map((field) => field.order)).toEqual([1, 2, 3]);
    });

    it('ignores out-of-bounds reorder requests', () => {
      const builder = useBuilderStore();
      const a = builder.addField('short_text');
      builder.reorderFields(0, 5);
      expect(builder.schema.fields.map((field) => field.id)).toEqual([a.id]);
    });

    it('adds, updates, and removes options on choice fields', () => {
      const builder = useBuilderStore();
      const select = builder.addField('select');
      const before = select.options.length;
      builder.addOption(select.id);
      const after = builder.schema.fields[0].options;
      expect(after.length).toBe(before + 1);

      const last = after[after.length - 1];
      builder.updateOption(select.id, last.id, { label: 'Custom', key: 'Custom Key!' });
      const updated = builder.schema.fields[0].options.find((opt) => opt.id === last.id);
      expect(updated.label).toBe('Custom');
      expect(updated.key).toBe('custom_key_');

      builder.removeOption(select.id, last.id);
      expect(builder.schema.fields[0].options.find((opt) => opt.id === last.id)).toBeUndefined();
    });

    it('ignores option mutations on non-optioned field types', () => {
      const builder = useBuilderStore();
      const f = builder.addField('short_text');
      builder.addOption(f.id);
      expect(builder.schema.fields[0].options).toEqual([]);
    });

    it('produces validation issues when the draft is empty', () => {
      const builder = useBuilderStore();
      const issues = builder.validateSchema();
      expect(issues.length).toBeGreaterThan(0);
      expect(builder.isValid).toBe(false);
    });
  });

  describe('persistence', () => {
    it('hydrates from the API and clears dirty state on setSurvey', () => {
      const builder = useBuilderStore();
      builder.setSurvey(
        surveyFixture({
          currentDraftSchema: {
            fields: [
              {
                id: 'field_x',
                type: 'short_text',
                key: 'hello',
                label: 'Hello',
                required: false,
                order: 1,
                options: [],
                validation: {},
                visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
                settings: { width: 'full', imageUrl: null },
              },
            ],
            sections: [],
            logicRules: [],
            layout: { mode: 'single_page', showProgress: true },
          },
        }),
      );
      expect(builder.surveyId).toBe('survey-1');
      expect(builder.schema.fields).toHaveLength(1);
      expect(builder.isDirty).toBe(false);
    });

    it('blocks saveDraft on client-side validation errors', async () => {
      const builder = useBuilderStore();
      builder.setSurvey(surveyFixture());
      // Empty schema → validation should fail.
      await expect(builder.saveDraft()).rejects.toMatchObject({ code: 'CLIENT_VALIDATION_ERROR' });
    });

    it('sends a normalised schema to the surveys PUT endpoint', async () => {
      const builder = useBuilderStore();
      builder.setSurvey(surveyFixture());
      builder.addField('short_text');

      const captured = {};
      const fetchMock = vi.fn(async (url, init) => {
        captured.url = url.toString();
        captured.method = init.method;
        captured.body = JSON.parse(init.body);
        return buildJsonResponse({
          success: true,
          data: {
            survey: surveyFixture({
              currentDraftSchema: captured.body.schema,
              updatedAt: '2026-05-21T00:00:00.000Z',
            }),
          },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      await builder.saveDraft();
      expect(captured.method).toBe('PUT');
      expect(captured.url).toMatch(/\/surveys\/survey-1$/);
      expect(captured.body.schema.fields).toHaveLength(1);
      // Normalised options must be stripped of internal ids.
      const firstField = captured.body.schema.fields[0];
      expect(firstField.options).toEqual([]);
      expect(builder.isDirty).toBe(false);
    });

    it('calls publishSurvey after auto-saving a dirty draft', async () => {
      const builder = useBuilderStore();
      builder.setSurvey(surveyFixture());
      builder.addField('short_text');

      const calls = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url, init) => {
          const path = url.toString();
          calls.push({ path, method: init.method });
          if (path.endsWith('/surveys/survey-1')) {
            return buildJsonResponse({
              success: true,
              data: {
                survey: surveyFixture({
                  updatedAt: '2026-05-21T00:00:00.000Z',
                  currentDraftSchema: builder.schema,
                }),
              },
            });
          }
          if (path.endsWith('/surveys/survey-1/publish')) {
            return buildJsonResponse({
              success: true,
              data: {
                survey: surveyFixture({ status: 'published', publishedVersionId: 'ver-1' }),
                version: { id: 'ver-1', versionNumber: 1 },
              },
            });
          }
          throw new Error(`Unexpected fetch ${path}`);
        }),
      );

      const result = await builder.publishSurvey();
      expect(result?.survey?.status).toBe('published');
      const methods = calls.map((c) => `${c.method} ${c.path.split('/').slice(-2).join('/')}`);
      expect(methods[0]).toBe('PUT surveys/survey-1');
      expect(methods[1]).toBe('POST survey-1/publish');
      expect(builder.survey.status).toBe('published');
    });
  });
});
