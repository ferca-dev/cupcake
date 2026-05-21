import { describe, it, expect } from 'vitest';

import { parseFormSchema, emptyFormSchema } from '../modules/surveys/form-schema.validator.js';

const baseField = (overrides = {}) => ({
  id: 'field_a',
  type: 'short_text',
  key: 'a',
  label: 'A',
  ...overrides,
});

describe('form schema validator', () => {
  it('accepts and normalises an empty schema input', () => {
    const result = parseFormSchema(undefined);
    expect(result).toEqual(emptyFormSchema());
  });

  it('strips unknown top-level keys', () => {
    expect(() =>
      parseFormSchema({
        fields: [],
        somethingExtra: true,
      }),
    ).toThrow();
  });

  it('rejects duplicate field keys', () => {
    expect(() =>
      parseFormSchema({
        fields: [
          baseField({ id: 'f1', key: 'same' }),
          baseField({ id: 'f2', key: 'same' }),
        ],
      }),
    ).toThrow(/Duplicate field key/);
  });

  it('rejects duplicate field ids', () => {
    expect(() =>
      parseFormSchema({
        fields: [
          baseField({ id: 'dup', key: 'a' }),
          baseField({ id: 'dup', key: 'b' }),
        ],
      }),
    ).toThrow(/Duplicate field id/);
  });

  it('rejects unsupported field types', () => {
    expect(() =>
      parseFormSchema({
        fields: [{ ...baseField(), type: 'mystery' }],
      }),
    ).toThrow(/Unsupported field type/);
  });

  it('requires options for select fields and rejects duplicates', () => {
    expect(() =>
      parseFormSchema({
        fields: [{ ...baseField(), type: 'select', key: 'choice', options: [] }],
      }),
    ).toThrow(/At least one option is required/);

    expect(() =>
      parseFormSchema({
        fields: [
          {
            ...baseField(),
            type: 'select',
            key: 'choice',
            options: [
              { key: 'one', label: 'One' },
              { key: 'one', label: 'One again' },
            ],
          },
        ],
      }),
    ).toThrow(/Duplicate option key/);
  });

  it('rejects options on non-optioned types', () => {
    expect(() =>
      parseFormSchema({
        fields: [
          { ...baseField(), options: [{ key: 'x', label: 'X' }] },
        ],
      }),
    ).toThrow(/Options are not allowed/);
  });

  it('rejects logic rules with unsupported operators', () => {
    expect(() =>
      parseFormSchema({
        fields: [baseField()],
        logicRules: [
          {
            id: 'r1',
            when: {
              all: [
                { fieldId: 'field_a', operator: 'magic', value: 'x' },
              ],
            },
            actions: [{ type: 'show', target: 'field_a' }],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects logic rules pointing to unknown field ids', () => {
    expect(() =>
      parseFormSchema({
        fields: [baseField()],
        logicRules: [
          {
            id: 'r1',
            when: {
              all: [{ fieldId: 'ghost', operator: 'equals', value: 'x' }],
            },
            actions: [{ type: 'show', target: 'field_a' }],
          },
        ],
      }),
    ).toThrow(/unknown field/);
  });

  it('allows presentation fields without a key', () => {
    expect(() =>
      parseFormSchema({
        fields: [
          {
            id: 'divider1',
            type: 'divider',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects input fields without a key', () => {
    expect(() =>
      parseFormSchema({
        fields: [
          {
            id: 'short_no_key',
            type: 'short_text',
          },
        ],
      }),
    ).toThrow(/Field key is required/);
  });
});
