import { describe, expect, it } from 'vitest';

import {
  buildInitialAnswers,
  serializeAnswers,
  validateAnswers,
} from '../features/public-form/answers.js';

const translator = (key, vars) => {
  if (!vars) return key;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.replace(`{${name}}`, String(value)),
    key,
  );
};

const field = (overrides = {}) => ({
  id: 'field_name',
  type: 'short_text',
  key: 'name',
  label: 'Your name',
  required: false,
  options: [],
  validation: {},
  ...overrides,
});

const schema = (fields) => ({ fields, sections: [], logicRules: [], layout: {} });

describe('buildInitialAnswers', () => {
  it('returns an empty value for every input field', () => {
    const state = buildInitialAnswers(
      schema([
        field({ id: 'a', key: 'a' }),
        field({ id: 'b', key: 'b', type: 'checkbox_group', options: [{ key: 'x', label: 'X' }] }),
        field({ id: 'c', type: 'section_title' }),
      ]),
    );
    expect(state).toEqual({ a: '', b: [] });
  });
});

describe('validateAnswers', () => {
  it('flags missing required fields', () => {
    const state = { field_name: '' };
    const errors = validateAnswers(schema([field({ required: true })]), state, translator);
    expect(errors.field_name).toBe('publicForm.fieldErrors.required');
  });

  it('validates email format', () => {
    const errors = validateAnswers(
      schema([field({ id: 'f', key: 'email', type: 'email', required: true })]),
      { f: 'not-an-email' },
      translator,
    );
    expect(errors.f).toBe('publicForm.fieldErrors.email');
  });

  it('enforces number min/max', () => {
    const errors = validateAnswers(
      schema([
        field({
          id: 'age',
          key: 'age',
          type: 'number',
          required: true,
          validation: { min: 18, max: 90 },
        }),
      ]),
      { age: 12 },
      translator,
    );
    expect(errors.age).toBe('publicForm.fieldErrors.min');
  });

  it('rejects invalid option keys for selects', () => {
    const errors = validateAnswers(
      schema([
        field({
          id: 'color',
          key: 'color',
          type: 'select',
          required: true,
          options: [
            { key: 'red', label: 'Red' },
            { key: 'blue', label: 'Blue' },
          ],
        }),
      ]),
      { color: 'green' },
      translator,
    );
    expect(errors.color).toBe('publicForm.fieldErrors.option');
  });

  it('passes valid input', () => {
    const errors = validateAnswers(
      schema([
        field({ id: 'name', key: 'name', required: true }),
        field({ id: 'agree', key: 'agree', type: 'checkbox', required: true }),
      ]),
      { name: 'Pat', agree: true },
      translator,
    );
    expect(errors).toEqual({});
  });
});

describe('validateAnswers with visibility', () => {
  it('skips required validation for fields hidden by a show_when rule', () => {
    const fields = [
      field({
        id: 'driver',
        key: 'driver',
        type: 'select',
        required: true,
        options: [
          { key: 'no', label: 'No' },
          { key: 'yes', label: 'Yes' },
        ],
      }),
      field({
        id: 'follow_up',
        key: 'follow_up',
        type: 'long_text',
        required: true,
        visibility: {
          mode: 'show_when',
          conditionMode: 'all',
          conditions: [{ fieldId: 'driver', operator: 'equals', value: 'yes' }],
        },
      }),
    ];
    const errors = validateAnswers(schema(fields), { driver: 'no', follow_up: '' }, translator);
    expect(errors.follow_up).toBeUndefined();
  });

  it('still requires hidden fields once they become visible', () => {
    const fields = [
      field({
        id: 'driver',
        key: 'driver',
        type: 'select',
        required: true,
        options: [
          { key: 'no', label: 'No' },
          { key: 'yes', label: 'Yes' },
        ],
      }),
      field({
        id: 'follow_up',
        key: 'follow_up',
        type: 'long_text',
        required: true,
        visibility: {
          mode: 'show_when',
          conditionMode: 'all',
          conditions: [{ fieldId: 'driver', operator: 'equals', value: 'yes' }],
        },
      }),
    ];
    const errors = validateAnswers(schema(fields), { driver: 'yes', follow_up: '' }, translator);
    expect(errors.follow_up).toBe('publicForm.fieldErrors.required');
  });
});

describe('serializeAnswers', () => {
  it('coerces text/number values and skips empty optional fields', () => {
    const result = serializeAnswers(
      schema([
        field({ id: 'name', key: 'name' }),
        field({ id: 'note', key: 'note' }),
        field({ id: 'age', key: 'age', type: 'number', validation: { min: 0 } }),
      ]),
      { name: '  Pat ', note: '', age: '42' },
    );
    expect(result).toEqual([
      { fieldId: 'name', key: 'name', type: 'short_text', value: 'Pat' },
      { fieldId: 'age', key: 'age', type: 'number', value: 42 },
    ]);
  });

  it('serializes checkbox_group as a string array', () => {
    const result = serializeAnswers(
      schema([
        field({
          id: 'tags',
          key: 'tags',
          type: 'checkbox_group',
          options: [
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B' },
          ],
        }),
      ]),
      { tags: ['a', 'b'] },
    );
    expect(result[0].value).toEqual(['a', 'b']);
  });

  it('serializes yes_no as a boolean', () => {
    const result = serializeAnswers(
      schema([field({ id: 'ok', key: 'ok', type: 'yes_no', required: true })]),
      { ok: false },
    );
    expect(result[0]).toMatchObject({ value: false });
  });
});
