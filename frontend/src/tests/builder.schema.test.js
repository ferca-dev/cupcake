import { describe, expect, it } from 'vitest';

import {
  buildDefaultField,
  buildEmptySchema,
  cloneFieldWithNewIds,
  generateFieldId,
  generateOptionId,
  isValidFormSchema,
  normalizeSchemaForApi,
  slugifyFieldKey,
  validateFormSchema,
} from '../features/builder/builder.schema.js';

describe('builder schema utilities', () => {
  describe('generators', () => {
    it('produces unique, backend-safe field ids', () => {
      const ids = new Set();
      for (let i = 0; i < 50; i += 1) ids.add(generateFieldId());
      expect(ids.size).toBe(50);
      for (const id of ids) {
        expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(id.length).toBeLessThanOrEqual(80);
      }
    });

    it('produces unique option ids', () => {
      const ids = new Set();
      for (let i = 0; i < 50; i += 1) ids.add(generateOptionId());
      expect(ids.size).toBe(50);
    });

    it('slugifies labels into safe field keys', () => {
      expect(slugifyFieldKey('Customer Name')).toBe('customer_name');
      expect(slugifyFieldKey('  Email Address!! ')).toBe('email_address');
      expect(slugifyFieldKey('¿Qué tal?')).toBe('que_tal');
      const fallback = slugifyFieldKey('  ', 'field');
      expect(fallback).toMatch(/^field_/);
    });
  });

  describe('buildDefaultField', () => {
    it('returns a backend-shaped field for an input type', () => {
      const field = buildDefaultField('short_text', { existingKeys: new Set() });
      expect(field).toMatchObject({
        type: 'short_text',
        required: false,
        sectionId: null,
        options: [],
      });
      expect(field.id).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(field.key).toMatch(/^[a-z0-9_]+$/);
      expect(field.settings.width).toBe('full');
      expect(field.validation).toEqual({
        minLength: null,
        maxLength: null,
        min: null,
        max: null,
        regex: null,
      });
    });

    it('disambiguates the key when it already exists', () => {
      const existing = new Set(['short_text']);
      const field = buildDefaultField('short_text', { existingKeys: existing });
      expect(field.key.startsWith('short_text')).toBe(true);
      expect(field.key).not.toBe('short_text');
    });

    it('emits two default options for choice fields', () => {
      const field = buildDefaultField('select', { existingKeys: new Set() });
      expect(field.options).toHaveLength(2);
      expect(field.options[0]).toMatchObject({ key: 'option_1', label: 'Option 1' });
    });

    it('omits the key for presentational types', () => {
      const field = buildDefaultField('divider', { existingKeys: new Set() });
      expect(field.key).toBe('');
      expect(field.options).toEqual([]);
    });

    it('rejects unsupported types', () => {
      expect(() => buildDefaultField('something_else', { existingKeys: new Set() })).toThrow();
    });
  });

  describe('cloneFieldWithNewIds', () => {
    it('preserves the payload but assigns fresh ids', () => {
      const original = buildDefaultField('checkbox_group', { existingKeys: new Set() });
      const copy = cloneFieldWithNewIds(original);
      expect(copy.id).not.toBe(original.id);
      expect(copy.options).toHaveLength(original.options.length);
      copy.options.forEach((opt, idx) => {
        expect(opt.id).not.toBe(original.options[idx].id);
        expect(opt.key).toBe(original.options[idx].key);
        expect(opt.label).toBe(original.options[idx].label);
      });
    });
  });

  describe('validateFormSchema', () => {
    it('returns an empty array for a valid schema', () => {
      const schema = buildEmptySchema();
      schema.fields.push(buildDefaultField('short_text', { existingKeys: new Set() }));
      const issues = validateFormSchema(schema);
      expect(issues).toEqual([]);
      expect(isValidFormSchema(schema)).toBe(true);
    });

    it('flags empty schemas', () => {
      const schema = buildEmptySchema();
      const issues = validateFormSchema(schema);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]).toMatchObject({ path: ['fields'] });
    });

    it('flags missing keys on input fields', () => {
      const field = buildDefaultField('short_text', { existingKeys: new Set() });
      field.key = '';
      const schema = buildEmptySchema();
      schema.fields.push(field);
      const issues = validateFormSchema(schema);
      expect(issues.some((issue) => issue.path?.[2] === 'key')).toBe(true);
    });

    it('flags duplicate field keys', () => {
      const a = buildDefaultField('short_text', { existingKeys: new Set() });
      const b = buildDefaultField('short_text', { existingKeys: new Set() });
      a.key = 'same';
      b.key = 'same';
      const schema = buildEmptySchema();
      schema.fields.push(a, b);
      const issues = validateFormSchema(schema);
      expect(issues.some((issue) => issue.message.includes('Duplicate field key'))).toBe(true);
    });

    it('flags option-less select fields', () => {
      const field = buildDefaultField('select', { existingKeys: new Set() });
      field.options = [];
      const schema = buildEmptySchema();
      schema.fields.push(field);
      const issues = validateFormSchema(schema);
      expect(issues.some((issue) => issue.path?.[2] === 'options')).toBe(true);
    });

    it('flags duplicate option keys', () => {
      const field = buildDefaultField('select', { existingKeys: new Set() });
      field.options = [
        { id: 'a', key: 'dup', label: 'A' },
        { id: 'b', key: 'dup', label: 'B' },
      ];
      const schema = buildEmptySchema();
      schema.fields.push(field);
      const issues = validateFormSchema(schema);
      expect(
        issues.some(
          (issue) =>
            issue.path?.[2] === 'options' &&
            issue.path?.[4] === 'key' &&
            issue.message.includes('Duplicate'),
        ),
      ).toBe(true);
    });

    it('flags presentational fields that smuggle in options', () => {
      const field = buildDefaultField('divider', { existingKeys: new Set() });
      field.options = [{ id: 'a', key: 'oops', label: 'Oops' }];
      const schema = buildEmptySchema();
      schema.fields.push(field);
      const issues = validateFormSchema(schema);
      expect(issues.some((issue) => issue.path?.[2] === 'options')).toBe(true);
    });
  });

  describe('normalizeSchemaForApi', () => {
    it('strips ids/extra props from options and reassigns field order', () => {
      const schema = buildEmptySchema();
      const a = buildDefaultField('short_text', { existingKeys: new Set() });
      const b = buildDefaultField('select', { existingKeys: new Set() });
      schema.fields.push(a, b);
      const normalised = normalizeSchemaForApi(schema);

      expect(normalised.fields).toHaveLength(2);
      expect(normalised.fields[0].order).toBe(1);
      expect(normalised.fields[1].order).toBe(2);
      for (const opt of normalised.fields[1].options) {
        expect(Object.keys(opt).sort()).toEqual(['key', 'label']);
      }
      expect(normalised.layout).toEqual({ mode: 'single_page', showProgress: true });
    });

    it('drops the key for presentational fields and keeps it for input fields', () => {
      const schema = buildEmptySchema();
      const divider = buildDefaultField('divider', { existingKeys: new Set() });
      const input = buildDefaultField('email', { existingKeys: new Set() });
      schema.fields.push(divider, input);
      const normalised = normalizeSchemaForApi(schema);
      expect('key' in normalised.fields[0]).toBe(false);
      expect(normalised.fields[1].key).toBeTruthy();
    });

    it('keeps uploaded media metadata on image blocks', () => {
      const schema = buildEmptySchema();
      const image = buildDefaultField('image_block', { existingKeys: new Set() });
      image.settings = {
        width: 'half',
        imageUrl: 'http://localhost:4000/uploads/tenants/t/surveys/pixel.png',
        mediaAssetId: '665000000000000000000001',
      };
      schema.fields.push(image);

      const normalised = normalizeSchemaForApi(schema);
      expect(normalised.fields[0].settings).toMatchObject({
        width: 'half',
        imageUrl: image.settings.imageUrl,
        mediaAssetId: image.settings.mediaAssetId,
      });
    });
  });
});
