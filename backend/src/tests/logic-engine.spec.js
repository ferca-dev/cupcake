import { describe, it, expect } from 'vitest';

import {
  evaluateCondition,
  evaluateConditionGroup,
  computeFieldVisibility,
  evaluateNavigation,
} from '../modules/surveys/logic-engine.service.js';

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

describe('logic engine operators', () => {
  it('evaluates equals against strings', () => {
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'equals', value: 'x' }, { a: 'x' }),
    ).toBe(true);
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'equals', value: 'x' }, { a: 'y' }),
    ).toBe(false);
  });

  it('evaluates equals against numbers stored as strings', () => {
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'equals', value: 7 }, { a: '7' }),
    ).toBe(true);
  });

  it('evaluates equals against booleans', () => {
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'equals', value: true }, { a: true }),
    ).toBe(true);
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'equals', value: false }, { a: true }),
    ).toBe(false);
  });

  it('checks array membership via equals on checkbox_group selections', () => {
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'equals', value: 'two' }, { a: ['one', 'two'] }),
    ).toBe(true);
  });

  it('evaluates contains case-insensitively on strings', () => {
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'contains', value: 'Foo' }, { a: 'a FOO bar' }),
    ).toBe(true);
  });

  it('evaluates contains on arrays as membership', () => {
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'contains', value: 'x' }, { a: ['x', 'y'] }),
    ).toBe(true);
    expect(
      evaluateCondition({ fieldId: 'a', operator: 'not_contains', value: 'z' }, { a: ['x', 'y'] }),
    ).toBe(true);
  });

  it('evaluates numeric comparisons', () => {
    const cases = [
      ['greater_than', 5, 3, true],
      ['greater_than', 3, 5, false],
      ['greater_than_or_equal', 5, 5, true],
      ['less_than', 1, 2, true],
      ['less_than_or_equal', 2, 2, true],
    ];
    for (const [op, answer, expected, result] of cases) {
      expect(
        evaluateCondition({ fieldId: 'a', operator: op, value: expected }, { a: answer }),
      ).toBe(result);
    }
  });

  it('evaluates is_empty / is_not_empty across types', () => {
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_empty' }, { a: '' })).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_empty' }, { a: '   ' })).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_empty' }, { a: [] })).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_empty' }, { a: null })).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_not_empty' }, { a: 'x' })).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', operator: 'is_not_empty' }, { a: ['x'] })).toBe(true);
  });

  it('returns false for unknown operators', () => {
    expect(evaluateCondition({ fieldId: 'a', operator: 'magic', value: 'x' }, { a: 'x' })).toBe(false);
  });
});

describe('logic engine condition groups', () => {
  it('returns true when conditions are empty', () => {
    expect(evaluateConditionGroup({ conditions: [], conditionMode: 'all' }, {})).toBe(true);
  });

  it('returns true only when all conditions hold for mode=all', () => {
    const conditions = [
      { fieldId: 'a', operator: 'equals', value: 'x' },
      { fieldId: 'b', operator: 'equals', value: 'y' },
    ];
    expect(
      evaluateConditionGroup({ conditions, conditionMode: 'all' }, { a: 'x', b: 'y' }),
    ).toBe(true);
    expect(
      evaluateConditionGroup({ conditions, conditionMode: 'all' }, { a: 'x', b: 'z' }),
    ).toBe(false);
  });

  it('returns true when at least one condition holds for mode=any', () => {
    const conditions = [
      { fieldId: 'a', operator: 'equals', value: 'x' },
      { fieldId: 'b', operator: 'equals', value: 'y' },
    ];
    expect(
      evaluateConditionGroup({ conditions, conditionMode: 'any' }, { a: 'no', b: 'y' }),
    ).toBe(true);
    expect(
      evaluateConditionGroup({ conditions, conditionMode: 'any' }, { a: 'no', b: 'no' }),
    ).toBe(false);
  });
});

describe('computeFieldVisibility', () => {
  it('treats fields with mode=always as visible', () => {
    const s = schema({ fields: [field({ id: 'f1' })] });
    expect(computeFieldVisibility(s, {}).get('f1')).toBe(true);
  });

  it('hides a show_when field while its condition is not satisfied', () => {
    const s = schema({
      fields: [
        field({ id: 'driver', key: 'driver' }),
        field({
          id: 'comments',
          key: 'comments',
          visibility: {
            mode: 'show_when',
            conditionMode: 'all',
            conditions: [{ fieldId: 'driver', operator: 'equals', value: 'low' }],
          },
        }),
      ],
    });
    expect(computeFieldVisibility(s, { driver: 'high' }).get('comments')).toBe(false);
    expect(computeFieldVisibility(s, { driver: 'low' }).get('comments')).toBe(true);
  });

  it('inverts evaluation for hide_when', () => {
    const s = schema({
      fields: [
        field({ id: 'driver', key: 'driver' }),
        field({
          id: 'comments',
          key: 'comments',
          visibility: {
            mode: 'hide_when',
            conditionMode: 'all',
            conditions: [{ fieldId: 'driver', operator: 'equals', value: 'high' }],
          },
        }),
      ],
    });
    expect(computeFieldVisibility(s, { driver: 'high' }).get('comments')).toBe(false);
    expect(computeFieldVisibility(s, { driver: 'low' }).get('comments')).toBe(true);
  });

  it('applies top-level visibility logicRules over per-field defaults', () => {
    const s = schema({
      fields: [
        field({ id: 'driver', key: 'driver' }),
        field({ id: 'extra', key: 'extra' }),
      ],
      logicRules: [
        {
          id: 'rule_1',
          type: 'visibility',
          targetFieldId: 'extra',
          conditions: [{ fieldId: 'driver', operator: 'equals', value: 'show' }],
          conditionMode: 'all',
          action: { type: 'hide' },
        },
      ],
    });
    expect(computeFieldVisibility(s, { driver: 'show' }).get('extra')).toBe(false);
    expect(computeFieldVisibility(s, { driver: 'no' }).get('extra')).toBe(true);
  });

  it('keeps presentation fields visible regardless of rules', () => {
    const s = schema({
      fields: [
        { id: 'd1', type: 'divider', visibility: { mode: 'always', conditionMode: 'all', conditions: [] } },
      ],
    });
    expect(computeFieldVisibility(s, {}).get('d1')).toBe(true);
  });
});

describe('evaluateNavigation', () => {
  it('returns continue when no rules match', () => {
    expect(evaluateNavigation(schema(), {})).toEqual({ kind: 'continue' });
  });

  it('returns end when an end rule matches', () => {
    const s = schema({
      fields: [field({ id: 'a' })],
      logicRules: [
        {
          id: 'r1',
          type: 'end',
          conditions: [{ fieldId: 'a', operator: 'equals', value: 'bye' }],
          conditionMode: 'all',
          action: { type: 'end_survey' },
        },
      ],
    });
    expect(evaluateNavigation(s, { a: 'bye' })).toMatchObject({ kind: 'end', ruleId: 'r1' });
  });

  it('returns the first matching navigation jump', () => {
    const s = schema({
      fields: [field({ id: 'a' })],
      logicRules: [
        {
          id: 'r1',
          type: 'navigation',
          conditions: [{ fieldId: 'a', operator: 'equals', value: 'go' }],
          conditionMode: 'all',
          action: { type: 'jump_to_field', target: 'a' },
        },
      ],
    });
    expect(evaluateNavigation(s, { a: 'go' })).toMatchObject({
      kind: 'jump_to_field',
      target: 'a',
    });
  });
});
