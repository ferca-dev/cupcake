// Conditional logic engine. Evaluates visibility, navigation, and end-survey
// rules against a snapshot of answers. The engine is intentionally pure: no
// database calls, no I/O. Callers (answer validator, public-form preview,
// future analytics) feed it `{ schema, answers }` and read back the
// visibility map and navigation hint.
//
// The same operator semantics are mirrored in the frontend at
// `frontend/src/features/logic/logic-engine.js`. If you change behaviour
// here, update that file and its tests too — backend remains the source of
// truth, but a divergence would break the builder preview / public form
// UX.

import { LOGIC_OPERATORS } from './form-schema.validator.js';

const NUMERIC_OPERATORS = new Set([
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
]);

const PRESENTATION_TYPES = new Set([
  'image_block',
  'text_block',
  'divider',
  'section_title',
  'page_break',
]);

const isNil = (value) => value === null || value === undefined;
const isEmptyString = (value) => typeof value === 'string' && value.trim().length === 0;

const isEmptyValue = (value) => {
  if (isNil(value)) return true;
  if (typeof value === 'string') return isEmptyString(value);
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const toComparable = (value) => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((entry) => toComparable(entry)).join(',');
  if (value === null || value === undefined) return '';
  return String(value);
};

const equalsValue = (answer, expected) => {
  if (Array.isArray(answer)) {
    return answer.map((entry) => toComparable(entry)).includes(toComparable(expected));
  }
  if (typeof answer === 'boolean' || typeof expected === 'boolean') {
    return Boolean(answer) === Boolean(expected);
  }
  if (typeof answer === 'number' || typeof expected === 'number') {
    const lhs = toNumber(answer);
    const rhs = toNumber(expected);
    if (lhs !== null && rhs !== null) return lhs === rhs;
  }
  return toComparable(answer) === toComparable(expected);
};

const containsValue = (answer, expected) => {
  if (Array.isArray(answer)) {
    const needle = toComparable(expected);
    return answer.map((entry) => toComparable(entry)).includes(needle);
  }
  if (typeof answer === 'string') {
    return answer.toLowerCase().includes(toComparable(expected).toLowerCase());
  }
  return false;
};

const numericCompare = (answer, expected, operator) => {
  const lhs = toNumber(answer);
  const rhs = toNumber(expected);
  if (lhs === null || rhs === null) return false;
  switch (operator) {
    case 'greater_than':
      return lhs > rhs;
    case 'greater_than_or_equal':
      return lhs >= rhs;
    case 'less_than':
      return lhs < rhs;
    case 'less_than_or_equal':
      return lhs <= rhs;
    default:
      return false;
  }
};

/**
 * Evaluates a single condition against the provided answers map.
 * `answers` is `{ [fieldId]: value }`. Returns a boolean.
 *
 * Unknown field references resolve to "not satisfied" — the validator
 * prevents this in stored schemas, but defensive code keeps an exception
 * from breaking submission.
 */
export const evaluateCondition = (condition, answers) => {
  if (!condition || typeof condition !== 'object') return false;
  if (!LOGIC_OPERATORS.includes(condition.operator)) return false;

  const answer = answers ? answers[condition.fieldId] : undefined;
  const expected = condition.value;

  switch (condition.operator) {
    case 'is_empty':
      return isEmptyValue(answer);
    case 'is_not_empty':
      return !isEmptyValue(answer);
    case 'equals':
      return equalsValue(answer, expected);
    case 'not_equals':
      return !equalsValue(answer, expected);
    case 'contains':
      return containsValue(answer, expected);
    case 'not_contains':
      return !containsValue(answer, expected);
    default:
      if (NUMERIC_OPERATORS.has(condition.operator)) {
        return numericCompare(answer, expected, condition.operator);
      }
      return false;
  }
};

/**
 * Evaluates a list of conditions joined by `all` or `any`. Empty lists
 * return `true` to keep the call site simple ("no rule means visible").
 */
export const evaluateConditionGroup = ({ conditions, conditionMode = 'all' }, answers) => {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  if (conditionMode === 'any') {
    return conditions.some((cond) => evaluateCondition(cond, answers));
  }
  return conditions.every((cond) => evaluateCondition(cond, answers));
};

const evaluateFieldShortcut = (field, answers) => {
  const visibility = field?.visibility ?? { mode: 'always' };
  const mode = visibility.mode ?? 'always';
  if (mode === 'always') return true;
  const satisfied = evaluateConditionGroup(
    {
      conditions: visibility.conditions ?? [],
      conditionMode: visibility.conditionMode ?? 'all',
    },
    answers,
  );
  if (mode === 'show_when') return satisfied;
  if (mode === 'hide_when') return !satisfied;
  return true;
};

const collectVisibilityRules = (schema) => {
  const rules = Array.isArray(schema?.logicRules) ? schema.logicRules : [];
  return rules.filter((rule) => rule && rule.type === 'visibility');
};

/**
 * Computes the visibility for every field in the schema. Presentation-only
 * fields (text blocks, dividers, page breaks) are always visible and are
 * still keyed in the returned map for consumers that iterate the result.
 *
 * Visibility is resolved in two passes:
 *   1. The per-field `visibility` shortcut sets the initial value.
 *   2. Top-level `logicRules` of type `visibility` override the initial
 *      value when their condition group is satisfied. The last applicable
 *      rule wins, so ordering rules matters.
 *
 * Returns a `Map<fieldId, boolean>`.
 */
export const computeFieldVisibility = (schema, answers) => {
  const result = new Map();
  const fields = schema?.fields ?? [];

  for (const field of fields) {
    if (!field || !field.id) continue;
    if (PRESENTATION_TYPES.has(field.type)) {
      result.set(field.id, true);
      continue;
    }
    result.set(field.id, evaluateFieldShortcut(field, answers));
  }

  for (const rule of collectVisibilityRules(schema)) {
    if (!rule.targetFieldId || !result.has(rule.targetFieldId)) continue;
    const satisfied = evaluateConditionGroup(rule, answers);
    if (!satisfied) continue;
    const desired =
      rule.action?.type === 'show' ? true : rule.action?.type === 'hide' ? false : null;
    if (desired === null) continue;
    result.set(rule.targetFieldId, desired);
  }

  return result;
};

/**
 * Convenience wrapper that returns true when the given field is visible
 * under the current answers. Useful when only one field's visibility is
 * needed.
 */
export const isFieldVisible = (schema, answers, fieldId) => {
  const map = computeFieldVisibility(schema, answers);
  return map.get(fieldId) !== false;
};

/**
 * Evaluates navigation and end rules. Returns the first applicable
 * non-default decision, or `{ kind: 'continue' }` if no rule matches.
 *
 * `kind`:
 *   - `'continue'`: proceed with the current rendering order.
 *   - `'end'`: short-circuit the survey and show the thank-you screen.
 *   - `'jump_to_field'`: skip to the given target.
 *   - `'jump_to_section'`: skip to the section.
 *   - `'jump_to_page'`: skip to the given paginated page number.
 *
 * The caller decides what to do with jumps; in single-page layouts they're
 * advisory only.
 */
export const evaluateNavigation = (schema, answers) => {
  const rules = Array.isArray(schema?.logicRules) ? schema.logicRules : [];
  for (const rule of rules) {
    if (!rule) continue;
    if (rule.type !== 'navigation' && rule.type !== 'end') continue;
    if (!evaluateConditionGroup(rule, answers)) continue;

    if (rule.type === 'end') {
      return { kind: 'end', ruleId: rule.id };
    }
    const target = rule.action?.target ?? null;
    if (!target) continue;
    return {
      kind: rule.action.type,
      target,
      ruleId: rule.id,
    };
  }
  return { kind: 'continue' };
};

export const __testing = {
  equalsValue,
  containsValue,
  numericCompare,
  isEmptyValue,
};
