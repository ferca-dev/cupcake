import { describe, it, expect } from 'vitest';

import { parseFormSchema, emptyFormSchema } from '../modules/surveys/form-schema.validator.js';

const baseField = (overrides = {}) => ({
  id: 'field_a',
  type: 'short_text',
  key: 'a',
  label: 'A',
  ...overrides,
});

const visibilityRule = (overrides = {}) => ({
  id: 'rule_1',
  type: 'visibility',
  targetFieldId: 'field_b',
  conditions: [{ fieldId: 'field_a', operator: 'equals', value: 'yes' }],
  conditionMode: 'all',
  action: { type: 'show' },
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
        fields: [baseField({ id: 'f1', key: 'same' }), baseField({ id: 'f2', key: 'same' })],
      }),
    ).toThrow(/Duplicate field key/);
  });

  it('rejects duplicate field ids', () => {
    expect(() =>
      parseFormSchema({
        fields: [baseField({ id: 'dup', key: 'a' }), baseField({ id: 'dup', key: 'b' })],
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
        fields: [{ ...baseField(), options: [{ key: 'x', label: 'X' }] }],
      }),
    ).toThrow(/Options are not allowed/);
  });

  it('rejects logic rules with unsupported operators', () => {
    expect(() =>
      parseFormSchema({
        fields: [baseField(), baseField({ id: 'field_b', key: 'b' })],
        logicRules: [
          visibilityRule({
            conditions: [{ fieldId: 'field_a', operator: 'magic', value: 'x' }],
          }),
        ],
      }),
    ).toThrow();
  });

  it('rejects logic rules pointing to unknown field ids', () => {
    expect(() =>
      parseFormSchema({
        fields: [baseField(), baseField({ id: 'field_b', key: 'b' })],
        logicRules: [
          visibilityRule({
            conditions: [{ fieldId: 'ghost', operator: 'equals', value: 'x' }],
          }),
        ],
      }),
    ).toThrow(/unknown field/);
  });

  it('rejects visibility rules targeting a deleted field', () => {
    expect(() =>
      parseFormSchema({
        fields: [baseField()],
        logicRules: [visibilityRule({ targetFieldId: 'field_gone' })],
      }),
    ).toThrow(/unknown field/);
  });

  it('rejects numeric operators against non-numeric fields with a non-numeric value', () => {
    expect(() =>
      parseFormSchema({
        fields: [
          baseField({ id: 'field_score', type: 'number', key: 'score' }),
          baseField({ id: 'field_b', key: 'b' }),
        ],
        logicRules: [
          visibilityRule({
            conditions: [{ fieldId: 'field_score', operator: 'greater_than', value: 'oops' }],
          }),
        ],
      }),
    ).toThrow(/numeric/i);
  });

  it('rejects per-field visibility conditions that reference themselves', () => {
    expect(() =>
      parseFormSchema({
        fields: [
          baseField({
            visibility: {
              mode: 'show_when',
              conditionMode: 'all',
              conditions: [{ fieldId: 'field_a', operator: 'equals', value: 'self' }],
            },
          }),
        ],
      }),
    ).toThrow(/itself/);
  });

  it('rejects visibility rule mode without conditions', () => {
    expect(() =>
      parseFormSchema({
        fields: [
          baseField({
            visibility: {
              mode: 'show_when',
              conditionMode: 'all',
              conditions: [],
            },
          }),
        ],
      }),
    ).toThrow(/at least one condition/i);
  });

  it('detects circular navigation rules', () => {
    expect(() =>
      parseFormSchema({
        fields: [baseField(), baseField({ id: 'field_b', key: 'b' })],
        logicRules: [
          {
            id: 'r1',
            type: 'navigation',
            conditions: [{ fieldId: 'field_a', operator: 'equals', value: 'go' }],
            conditionMode: 'all',
            action: { type: 'jump_to_field', target: 'field_b' },
          },
          {
            id: 'r2',
            type: 'navigation',
            conditions: [{ fieldId: 'field_b', operator: 'equals', value: 'back' }],
            conditionMode: 'all',
            action: { type: 'jump_to_field', target: 'field_a' },
          },
        ],
      }),
    ).toThrow(/cycle/i);
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

  it('accepts a fully-formed visibility rule', () => {
    expect(() =>
      parseFormSchema({
        fields: [baseField(), baseField({ id: 'field_b', key: 'b' })],
        logicRules: [visibilityRule()],
      }),
    ).not.toThrow();
  });
});
