import { describe, it, expect } from 'vitest';

import {
  evaluateCondition,
  evaluateConditionGroup,
  computeFieldVisibility,
  evaluateNavigation,
} from '../features/logic/logic-engine.js';

const field = (overrides = {}) => ({
  id: 'field_a',
  type: 'short_text',
  key: 'a',
  visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
  ...overrides,
});

const schema = (overrides = {}) => ({
  fields: [],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
  ...overrides,
});

describe('frontend logic engine', () => {
  it('evaluates equals/contains operators', () => {
    expect(evaluateCondition({ fieldId: 'a', operator: 'equals', value: 'x' }, { a: 'x' })).toBe(true);
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'contains', value: 'foo' }, { a: 'hello FOO' }),
    ).toBe(true);
  });

  it('handles numeric comparisons', () => {
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'greater_than', value: 3 }, { a: 5 }),
    ).toBe(true);
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'less_than_or_equal', value: 5 }, { a: '5' }),
    ).toBe(true);
  });

  it('handles is_empty / is_not_empty across types', () => {
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_empty' }, { a: '' })).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_empty' }, { a: null })).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_not_empty' }, { a: 'x' })).toBe(true);
  });

  it('combines conditions with all and any', () => {
    const conditions = [
      { fieldId: 'a', operator: 'equals', value: 'x' },
      { fieldId: 'b', operator: 'equals', value: 'y' },
    ];
    expect(evaluateConditionGroup({ conditions, conditionMode: 'all' }, { a: 'x', b: 'z' })).toBe(false);
    expect(evaluateConditionGroup({ conditions, conditionMode: 'any' }, { a: 'x', b: 'z' })).toBe(true);
  });

  it('computes visibility from the show_when shortcut', () => {
    const s = schema({
      fields: [
        field({ id: 'driver', key: 'driver' }),
        field({
          id: 'follow_up',
          key: 'follow_up',
          visibility: {
            mode: 'show_when',
            conditionMode: 'all',
            conditions: [{ fieldId: 'driver', operator: 'equals', value: 'yes' }],
          },
        }),
      ],
    });
    expect(computeFieldVisibility(s, { driver: 'no' }).get('follow_up')).toBe(false);
    expect(computeFieldVisibility(s, { driver: 'yes' }).get('follow_up')).toBe(true);
  });

  it('overrides per-field shortcuts with logicRules', () => {
    const s = schema({
      fields: [field({ id: 'a' }), field({ id: 'b' })],
      logicRules: [
        {
          id: 'r1',
          type: 'visibility',
          targetFieldId: 'b',
          conditions: [{ fieldId: 'a', operator: 'equals', value: 'hide' }],
          conditionMode: 'all',
          action: { type: 'hide' },
        },
      ],
    });
    expect(computeFieldVisibility(s, { a: 'hide' }).get('b')).toBe(false);
    expect(computeFieldVisibility(s, { a: 'show' }).get('b')).toBe(true);
  });

  it('returns end navigation when a matching end rule fires', () => {
    const s = schema({
      fields: [field({ id: 'a' })],
      logicRules: [
        {
          id: 'end1',
          type: 'end',
          conditions: [{ fieldId: 'a', operator: 'equals', value: 'bye' }],
          conditionMode: 'all',
          action: { type: 'end_survey' },
        },
      ],
    });
    expect(evaluateNavigation(s, { a: 'bye' })).toMatchObject({ kind: 'end', ruleId: 'end1' });
  });
});
