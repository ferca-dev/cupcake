// Frontend mirror of the backend logic engine in
// `backend/src/modules/surveys/logic-engine.service.js`. Used by the
// builder preview and the public form to compute which fields are visible
// based on the current answers. Backend remains authoritative on submit —
// this is just for keeping the UX in sync with what the server will accept.
//
// If you change the semantics here, change the backend file too (and its
// tests). The two files are intentionally small and parallel so drift is
// easy to spot.

export const LOGIC_OPERATORS = Object.freeze([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'is_empty',
  'is_not_empty',
]);

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

const isEmptyValue = (value) => {
  if (isNil(value)) return true;
  if (typeof value === 'string') return value.trim().length === 0;
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

  const rules = Array.isArray(schema?.logicRules) ? schema.logicRules : [];
  for (const rule of rules) {
    if (!rule || rule.type !== 'visibility') continue;
    if (!rule.targetFieldId || !result.has(rule.targetFieldId)) continue;
    const satisfied = evaluateConditionGroup(rule, answers);
    if (!satisfied) continue;
    const action = rule.action?.type;
    if (action === 'show') result.set(rule.targetFieldId, true);
    else if (action === 'hide') result.set(rule.targetFieldId, false);
  }

  return result;
};

export const isFieldVisible = (schema, answers, fieldId) => {
  const map = computeFieldVisibility(schema, answers);
  return map.get(fieldId) !== false;
};

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
    return { kind: rule.action.type, target, ruleId: rule.id };
  }
  return { kind: 'continue' };
};
