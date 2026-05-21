// Client-side form-schema utilities used by the builder.
//
// Goals:
//   - Generate stable, backend-safe field/option/rule ids and keys.
//   - Build a default field for any supported type.
//   - Run a fast pre-flight validation that mirrors the backend Zod schema in
//     `backend/src/modules/surveys/form-schema.validator.js`. The backend is
//     still the authoritative validator on save — this just keeps the user
//     from hitting a 422 for trivially-fixable issues.
//   - Normalise the in-memory builder schema into the exact shape the API
//     accepts.
//
// Whenever a rule changes here, mirror the corresponding rule in the backend
// validator (or rely on the backend response to surface the issue at save
// time).

import {
  FIELD_TYPES,
  FIELD_WIDTHS,
  OPTIONED_FIELD_TYPES,
  PRESENTATION_FIELD_TYPES,
  getFieldCatalogEntry,
} from './builder.constants.js';

const FIELD_KEY_REGEX = /^[a-z0-9_]+$/;
const FIELD_ID_REGEX = /^[A-Za-z0-9_-]+$/;
const LOGIC_OPERATORS = Object.freeze([
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
const VISIBILITY_MODES = Object.freeze(['always', 'show_when', 'hide_when']);
const CONDITION_MODES = Object.freeze(['all', 'any']);
const LAYOUT_MODES = Object.freeze(['single_page', 'paginated']);
const LOGIC_RULE_TYPES = Object.freeze(['visibility', 'navigation', 'end']);
const VISIBILITY_ACTIONS = Object.freeze(['show', 'hide']);
const NAVIGATION_ACTIONS = Object.freeze(['jump_to_field', 'jump_to_section', 'jump_to_page']);
const END_ACTIONS = Object.freeze(['end_survey']);
const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);

// Counter used to disambiguate ids when several are generated in the same
// millisecond — guarantees uniqueness even on fast clicks.
let idCounter = 0;
const nextCounter = () => {
  idCounter = (idCounter + 1) % 1_000_000;
  return idCounter.toString(36).padStart(2, '0');
};

const randomChunk = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0].toString(36);
  }
  return Math.floor(Math.random() * 0xffffffff).toString(36);
};

export const generateFieldId = () =>
  `field_${Date.now().toString(36)}${nextCounter()}${randomChunk()}`;

export const generateOptionId = () =>
  `opt_${Date.now().toString(36)}${nextCounter()}${randomChunk()}`;

export const generateSectionId = () =>
  `section_${Date.now().toString(36)}${nextCounter()}${randomChunk()}`;

export const generateRuleId = () =>
  `rule_${Date.now().toString(36)}${nextCounter()}${randomChunk()}`;

/**
 * Build a backend-safe field key from a candidate label. Falls back to a
 * stable random suffix if the label contains nothing usable.
 */
export const slugifyFieldKey = (raw, fallbackPrefix = 'field') => {
  const base = String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  if (base) return base;
  return `${fallbackPrefix}_${randomChunk()}`.slice(0, 60);
};

const uniqueFieldKey = (desired, existingKeys) => {
  if (!desired) return desired;
  if (!existingKeys.has(desired)) return desired;
  let i = 2;
  let candidate = `${desired}_${i}`;
  while (existingKeys.has(candidate)) {
    i += 1;
    candidate = `${desired}_${i}`;
  }
  return candidate;
};

const defaultOptions = (type) => {
  if (!OPTIONED_FIELD_TYPES.has(type)) return [];
  return [
    { id: generateOptionId(), key: 'option_1', label: 'Option 1' },
    { id: generateOptionId(), key: 'option_2', label: 'Option 2' },
  ];
};

const defaultValidation = () => ({
  minLength: null,
  maxLength: null,
  min: null,
  max: null,
  regex: null,
});

export const defaultVisibility = () => ({
  mode: 'always',
  conditionMode: 'all',
  conditions: [],
});

const defaultSettings = () => ({ width: 'full', imageUrl: null });

/**
 * Returns a fresh field shaped like the backend's form schema. `existingKeys`
 * is passed so the generated key does not collide with fields already in the
 * draft.
 */
export const buildDefaultField = (type, { order = 0, existingKeys } = {}) => {
  if (!FIELD_TYPES.includes(type)) {
    throw new Error(`Unsupported field type: ${type}`);
  }
  const catalog = getFieldCatalogEntry(type);
  const isPresentation = PRESENTATION_FIELD_TYPES.has(type);
  const keySet = existingKeys instanceof Set ? existingKeys : new Set(existingKeys ?? []);
  const baseLabel = catalog?.defaultLabel ?? catalog?.label ?? '';

  const field = {
    id: generateFieldId(),
    type,
    key: isPresentation ? '' : uniqueFieldKey(slugifyFieldKey(baseLabel || type, type), keySet),
    label: baseLabel,
    placeholder: catalog?.defaultPlaceholder ?? '',
    helpText: '',
    required: false,
    order,
    sectionId: null,
    options: defaultOptions(type),
    validation: defaultValidation(),
    visibility: defaultVisibility(),
    settings: defaultSettings(),
  };
  return field;
};

/**
 * Returns a default-shaped, empty schema. Matches the backend's
 * `emptyFormSchema()` so the builder and the API can round-trip blank
 * drafts losslessly.
 */
export const buildEmptySchema = () => ({
  fields: [],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

const normalizeCondition = (cond) => ({
  fieldId: typeof cond?.fieldId === 'string' ? cond.fieldId : '',
  operator: LOGIC_OPERATORS.includes(cond?.operator) ? cond.operator : 'equals',
  value: NO_VALUE_OPERATORS.has(cond?.operator) ? undefined : (cond?.value ?? ''),
});

const cloneField = (field, overrides = {}) => ({
  ...field,
  options: Array.isArray(field.options) ? field.options.map((opt) => ({ ...opt })) : [],
  validation: { ...defaultValidation(), ...(field.validation ?? {}) },
  visibility: {
    mode: VISIBILITY_MODES.includes(field.visibility?.mode) ? field.visibility.mode : 'always',
    conditionMode: CONDITION_MODES.includes(field.visibility?.conditionMode)
      ? field.visibility.conditionMode
      : 'all',
    conditions: Array.isArray(field.visibility?.conditions)
      ? field.visibility.conditions.map(normalizeCondition)
      : [],
  },
  settings: { ...defaultSettings(), ...(field.settings ?? {}) },
  ...overrides,
});

/**
 * Returns a deep copy of `field` with new ids on the field itself and on
 * each option. Useful for the duplicate action.
 */
export const cloneFieldWithNewIds = (field) => {
  const cloned = cloneField(field, {
    id: generateFieldId(),
    options: Array.isArray(field.options)
      ? field.options.map((opt) => ({ ...opt, id: generateOptionId() }))
      : [],
  });
  return cloned;
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeVisibility = (visibility) => {
  const safe = isPlainObject(visibility) ? visibility : {};
  return {
    mode: VISIBILITY_MODES.includes(safe.mode) ? safe.mode : 'always',
    conditionMode: CONDITION_MODES.includes(safe.conditionMode) ? safe.conditionMode : 'all',
    conditions: Array.isArray(safe.conditions) ? safe.conditions.map(normalizeCondition) : [],
  };
};

const DEFAULT_ACTION_BY_TYPE = {
  visibility: 'show',
  navigation: 'jump_to_field',
  end: 'end_survey',
};

const ALLOWED_ACTIONS_BY_TYPE = {
  visibility: VISIBILITY_ACTIONS,
  navigation: NAVIGATION_ACTIONS,
  end: END_ACTIONS,
};

const resolveActionType = (ruleType, candidateType) => {
  const allowed = ALLOWED_ACTIONS_BY_TYPE[ruleType] ?? [];
  if (allowed.includes(candidateType)) return candidateType;
  return DEFAULT_ACTION_BY_TYPE[ruleType] ?? 'show';
};

const normalizeLogicRule = (rule) => {
  if (!isPlainObject(rule)) return null;
  const type = LOGIC_RULE_TYPES.includes(rule.type) ? rule.type : 'visibility';
  const conditionMode = CONDITION_MODES.includes(rule.conditionMode) ? rule.conditionMode : 'all';
  const conditions = Array.isArray(rule.conditions) ? rule.conditions.map(normalizeCondition) : [];
  const action = {
    type: resolveActionType(type, rule.action?.type),
    target:
      typeof rule.action?.target === 'string' && rule.action.target.length > 0
        ? rule.action.target
        : null,
  };
  return {
    id: typeof rule.id === 'string' && rule.id ? rule.id : generateRuleId(),
    name: typeof rule.name === 'string' ? rule.name : '',
    type,
    targetFieldId:
      typeof rule.targetFieldId === 'string' && rule.targetFieldId ? rule.targetFieldId : null,
    targetSectionId:
      typeof rule.targetSectionId === 'string' && rule.targetSectionId
        ? rule.targetSectionId
        : null,
    conditions,
    conditionMode,
    action,
  };
};

/**
 * Normalises the draft schema into the exact shape the backend expects.
 * Hydrates defaults, strips presentational keys/options, and reassigns the
 * `order` property based on array position so the saved schema is canonical.
 */
export const normalizeSchemaForApi = (schema) => {
  const safe = isPlainObject(schema) ? schema : {};
  const layout = isPlainObject(safe.layout) ? safe.layout : {};

  const fields = Array.isArray(safe.fields) ? safe.fields : [];

  return {
    fields: fields.map((field, index) => {
      const isPresentation = PRESENTATION_FIELD_TYPES.has(field?.type);
      const isOptioned = OPTIONED_FIELD_TYPES.has(field?.type);
      const settings = isPlainObject(field?.settings) ? field.settings : {};
      const validation = isPlainObject(field?.validation) ? field.validation : {};

      const normalised = {
        id: field.id,
        type: field.type,
        label: typeof field.label === 'string' ? field.label : '',
        placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
        helpText: typeof field.helpText === 'string' ? field.helpText : '',
        required: Boolean(field.required),
        order: index + 1,
        sectionId: typeof field.sectionId === 'string' && field.sectionId ? field.sectionId : null,
        options: isOptioned
          ? (Array.isArray(field.options) ? field.options : []).map((opt) => ({
              key: typeof opt.key === 'string' ? opt.key.trim() : '',
              label: typeof opt.label === 'string' ? opt.label : '',
            }))
          : [],
        validation: {
          minLength: isFiniteNumber(validation.minLength) ? validation.minLength : null,
          maxLength: isFiniteNumber(validation.maxLength) ? validation.maxLength : null,
          min: isFiniteNumber(validation.min) ? validation.min : null,
          max: isFiniteNumber(validation.max) ? validation.max : null,
          regex:
            typeof validation.regex === 'string' && validation.regex.length > 0
              ? validation.regex
              : null,
        },
        visibility: normalizeVisibility(field.visibility),
        settings: {
          width: FIELD_WIDTHS.includes(settings.width) ? settings.width : 'full',
          imageUrl:
            typeof settings.imageUrl === 'string' && settings.imageUrl.length > 0
              ? settings.imageUrl
              : null,
        },
      };

      if (!isPresentation) {
        const key = typeof field.key === 'string' ? field.key.trim() : '';
        if (key) normalised.key = key;
      }

      return normalised;
    }),
    sections: Array.isArray(safe.sections)
      ? safe.sections.map((section, index) => ({
          id: section.id,
          title: typeof section.title === 'string' ? section.title : '',
          description: typeof section.description === 'string' ? section.description : '',
          order: index + 1,
        }))
      : [],
    logicRules: Array.isArray(safe.logicRules)
      ? safe.logicRules.map(normalizeLogicRule).filter(Boolean)
      : [],
    layout: {
      mode: LAYOUT_MODES.includes(layout.mode) ? layout.mode : 'single_page',
      showProgress: layout.showProgress !== false,
    },
  };
};

const issue = (path, message) => ({ path, message });

/**
 * Returns the operators that make sense for the given field type. Mirrors
 * the backend `operatorsForField` so the UI only offers compatible options.
 */
export const operatorsForFieldType = (type) => {
  switch (type) {
    case 'number':
    case 'rating':
    case 'nps':
    case 'date':
    case 'time':
      return [...LOGIC_OPERATORS];
    case 'checkbox':
    case 'yes_no':
      return ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
    case 'checkbox_group':
      return ['contains', 'not_contains', 'is_empty', 'is_not_empty'];
    case 'select':
    case 'radio_group':
    case 'short_text':
    case 'long_text':
    case 'email':
    case 'phone':
    case 'hidden':
      return ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'];
    default:
      return [];
  }
};

const validateConditionList = ({
  conditions,
  basePath,
  fieldsById,
  ownerFieldId = null,
  issues,
}) => {
  if (!Array.isArray(conditions)) return;
  conditions.forEach((cond, condIdx) => {
    const sourcePath = [...basePath, condIdx];
    const source = fieldsById.get(cond?.fieldId);
    if (!source) {
      issues.push(issue([...sourcePath, 'fieldId'], 'Pick a field for this condition.'));
      return;
    }
    if (ownerFieldId && source.id === ownerFieldId) {
      issues.push(issue([...sourcePath, 'fieldId'], 'A field cannot reference itself.'));
    }
    const operators = operatorsForFieldType(source.type);
    if (!operators.includes(cond.operator)) {
      issues.push(
        issue(
          [...sourcePath, 'operator'],
          `Operator "${cond.operator}" is not supported for "${source.type}".`,
        ),
      );
      return;
    }
    if (
      !NO_VALUE_OPERATORS.has(cond.operator) &&
      (cond.value === undefined || cond.value === null || cond.value === '')
    ) {
      issues.push(issue([...sourcePath, 'value'], 'Provide a value for this condition.'));
    }
  });
};

/**
 * Validates the in-memory schema and returns a list of issues. The empty
 * array means the schema is safe to send to the backend. The rules here
 * mirror the backend Zod schema; the backend remains authoritative.
 */
export const validateFormSchema = (schema) => {
  const issues = [];
  if (!isPlainObject(schema)) {
    return [issue([], 'Schema must be an object')];
  }

  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const sections = Array.isArray(schema.sections) ? schema.sections : [];
  const logicRules = Array.isArray(schema.logicRules) ? schema.logicRules : [];
  const fieldIds = new Set();
  const fieldsById = new Map();
  const fieldKeys = new Set();
  const sectionIds = new Set(sections.map((section) => section?.id).filter(Boolean));

  if (fields.length === 0) {
    issues.push(issue(['fields'], 'Add at least one field before saving.'));
  }

  fields.forEach((field, index) => {
    const path = ['fields', index];
    if (!field || typeof field !== 'object') {
      issues.push(issue(path, 'Field is malformed.'));
      return;
    }
    if (!field.id || !FIELD_ID_REGEX.test(String(field.id))) {
      issues.push(issue([...path, 'id'], 'Field id is missing or invalid.'));
    } else if (fieldIds.has(field.id)) {
      issues.push(issue([...path, 'id'], `Duplicate field id "${field.id}".`));
    } else {
      fieldIds.add(field.id);
      fieldsById.set(field.id, field);
    }

    if (!FIELD_TYPES.includes(field.type)) {
      issues.push(issue([...path, 'type'], `Unsupported field type "${field.type}".`));
      return;
    }

    const isPresentation = PRESENTATION_FIELD_TYPES.has(field.type);
    const isOptioned = OPTIONED_FIELD_TYPES.has(field.type);

    if (!isPresentation) {
      const key = typeof field.key === 'string' ? field.key.trim() : '';
      if (!key) {
        issues.push(issue([...path, 'key'], 'Field key is required.'));
      } else if (!FIELD_KEY_REGEX.test(key)) {
        issues.push(
          issue([...path, 'key'], 'Field key must be lowercase letters, numbers, or underscores.'),
        );
      } else if (fieldKeys.has(key)) {
        issues.push(issue([...path, 'key'], `Duplicate field key "${key}".`));
      } else {
        fieldKeys.add(key);
      }
    }

    if (typeof field.label === 'string' && field.label.length > 300) {
      issues.push(issue([...path, 'label'], 'Label is too long (300 characters max).'));
    }

    if (isOptioned) {
      const options = Array.isArray(field.options) ? field.options : [];
      if (options.length === 0) {
        issues.push(issue([...path, 'options'], 'Add at least one option.'));
      } else {
        const seenKeys = new Set();
        options.forEach((opt, optIdx) => {
          const optPath = [...path, 'options', optIdx];
          const optKey = typeof opt?.key === 'string' ? opt.key.trim() : '';
          if (!optKey) {
            issues.push(issue([...optPath, 'key'], 'Option key is required.'));
          } else if (!FIELD_KEY_REGEX.test(optKey)) {
            issues.push(
              issue(
                [...optPath, 'key'],
                'Option key must be lowercase letters, numbers, or underscores.',
              ),
            );
          } else if (seenKeys.has(optKey)) {
            issues.push(issue([...optPath, 'key'], `Duplicate option key "${optKey}".`));
          } else {
            seenKeys.add(optKey);
          }
          if (!opt?.label || String(opt.label).trim().length === 0) {
            issues.push(issue([...optPath, 'label'], 'Option label is required.'));
          }
        });
      }
    } else if (Array.isArray(field.options) && field.options.length > 0) {
      issues.push(issue([...path, 'options'], 'Options are not allowed for this field type.'));
    }

    if (field.sectionId && !sectionIds.has(field.sectionId)) {
      issues.push(
        issue([...path, 'sectionId'], `Field references unknown section "${field.sectionId}".`),
      );
    }
  });

  fields.forEach((field, index) => {
    const visibility = field?.visibility;
    if (!visibility || visibility.mode === 'always') return;
    const conditions = Array.isArray(visibility.conditions) ? visibility.conditions : [];
    if (conditions.length === 0) {
      issues.push(
        issue(
          ['fields', index, 'visibility', 'conditions'],
          'Visibility rules need at least one condition.',
        ),
      );
    }
    validateConditionList({
      conditions,
      basePath: ['fields', index, 'visibility', 'conditions'],
      fieldsById,
      ownerFieldId: field.id,
      issues,
    });
  });

  const ruleIds = new Set();
  logicRules.forEach((rule, index) => {
    const path = ['logicRules', index];
    if (!isPlainObject(rule)) {
      issues.push(issue(path, 'Logic rule is malformed.'));
      return;
    }
    if (!rule.id) {
      issues.push(issue([...path, 'id'], 'Logic rule id is required.'));
    } else if (ruleIds.has(rule.id)) {
      issues.push(issue([...path, 'id'], `Duplicate logic rule id "${rule.id}".`));
    } else {
      ruleIds.add(rule.id);
    }
    if (!LOGIC_RULE_TYPES.includes(rule.type)) {
      issues.push(issue([...path, 'type'], 'Unsupported logic rule type.'));
      return;
    }
    if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
      issues.push(issue([...path, 'conditions'], 'Add at least one condition.'));
    } else {
      validateConditionList({
        conditions: rule.conditions,
        basePath: [...path, 'conditions'],
        fieldsById,
        issues,
      });
    }

    if (rule.type === 'visibility') {
      if (!rule.targetFieldId || !fieldsById.has(rule.targetFieldId)) {
        issues.push(issue([...path, 'targetFieldId'], 'Pick a target field to show or hide.'));
      }
      if (!VISIBILITY_ACTIONS.includes(rule.action?.type)) {
        issues.push(
          issue([...path, 'action', 'type'], 'Visibility rules must show or hide a field.'),
        );
      }
    } else if (rule.type === 'navigation') {
      if (!NAVIGATION_ACTIONS.includes(rule.action?.type)) {
        issues.push(
          issue(
            [...path, 'action', 'type'],
            'Navigation rules must jump to a field, section, or page.',
          ),
        );
      }
      const target = rule.action?.target;
      if (!target) {
        issues.push(issue([...path, 'action', 'target'], 'Pick where to jump to.'));
      } else if (rule.action.type === 'jump_to_field' && !fieldsById.has(target)) {
        issues.push(issue([...path, 'action', 'target'], `Unknown jump target "${target}".`));
      } else if (rule.action.type === 'jump_to_section' && !sectionIds.has(target)) {
        issues.push(issue([...path, 'action', 'target'], `Unknown section "${target}".`));
      } else if (rule.action.type === 'jump_to_page') {
        const num = Number(target);
        if (!Number.isInteger(num) || num < 1) {
          issues.push(issue([...path, 'action', 'target'], 'Page must be a positive integer.'));
        }
      }
    } else if (rule.type === 'end' && !END_ACTIONS.includes(rule.action?.type)) {
      issues.push(issue([...path, 'action', 'type'], 'End rules must use end_survey.'));
    }
  });

  return issues;
};

export const isValidFormSchema = (schema) => validateFormSchema(schema).length === 0;

export const FIELD_KEY_PATTERN = FIELD_KEY_REGEX;
export const SUPPORTED_LOGIC_OPERATORS = LOGIC_OPERATORS;
export const SUPPORTED_VISIBILITY_MODES = VISIBILITY_MODES;
export const SUPPORTED_CONDITION_MODES = CONDITION_MODES;
export const SUPPORTED_LOGIC_RULE_TYPES = LOGIC_RULE_TYPES;
export const SUPPORTED_VISIBILITY_ACTIONS = VISIBILITY_ACTIONS;
export const SUPPORTED_NAVIGATION_ACTIONS = NAVIGATION_ACTIONS;
