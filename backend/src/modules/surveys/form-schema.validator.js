import { z } from 'zod';

/**
 * Supported field types accepted in survey form schemas. Stays in sync with
 * the public spec in `prompts/00-shared-context.md`. Adding a new type here
 * implicitly makes it valid for new draft schemas, so changes must be
 * intentional and reviewed.
 */
export const FIELD_TYPES = Object.freeze([
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'time',
  'select',
  'radio_group',
  'checkbox_group',
  'checkbox',
  'yes_no',
  'rating',
  'nps',
  'file_upload',
  'image_block',
  'text_block',
  'divider',
  'section_title',
  'page_break',
  'hidden',
]);

/**
 * Field types that select an option from a closed list. They must have at
 * least one `options` entry, each with a key/label pair.
 */
const OPTIONED_TYPES = new Set(['select', 'radio_group', 'checkbox_group']);

/**
 * Field types that are purely presentational. They do not collect input and
 * therefore do not need a `key` or validation rules.
 */
const PRESENTATION_TYPES = new Set([
  'image_block',
  'text_block',
  'divider',
  'section_title',
  'page_break',
]);

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

const NUMERIC_ONLY_OPERATORS = new Set([
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
]);

const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);

const NUMERIC_COMPARABLE_TYPES = new Set(['number', 'rating', 'nps']);

const VISIBILITY_MODES = ['always', 'show_when', 'hide_when'];
const CONDITION_MODES = ['all', 'any'];

const LOGIC_RULE_TYPES = ['visibility', 'navigation', 'end'];
const VISIBILITY_ACTION_TYPES = ['show', 'hide'];
const NAVIGATION_ACTION_TYPES = ['jump_to_field', 'jump_to_section', 'jump_to_page'];
const END_ACTION_TYPES = ['end_survey'];

const optionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, 'Option key is required')
      .max(80, 'Option key is too long')
      .regex(/^[a-z0-9_]+$/, 'Option key must be lowercase letters, numbers, or underscores'),
    label: z.string().trim().min(1, 'Option label is required').max(200),
    value: z.unknown().optional(),
  })
  .strict();

const validationRulesSchema = z
  .object({
    minLength: z.number().int().nonnegative().nullable().optional(),
    maxLength: z.number().int().nonnegative().nullable().optional(),
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    regex: z.string().max(500).nullable().optional(),
  })
  .strict()
  .default({});

const conditionSchema = z
  .object({
    fieldId: z.string().trim().min(1, 'Condition fieldId is required'),
    operator: z.enum(LOGIC_OPERATORS, {
      errorMap: () => ({ message: 'Unsupported logic operator' }),
    }),
    value: z.unknown().optional(),
  })
  .strict();

const visibilitySchema = z
  .object({
    mode: z.enum(VISIBILITY_MODES).default('always'),
    conditionMode: z.enum(CONDITION_MODES).default('all'),
    conditions: z.array(conditionSchema).default([]),
  })
  .strict()
  .default({ mode: 'always', conditionMode: 'all', conditions: [] });

const fieldSettingsSchema = z
  .object({
    width: z.enum(['full', 'half', 'third', 'quarter']).default('full'),
    imageUrl: z.string().max(2000).nullable().optional(),
    mediaAssetId: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{24}$/i, 'Media asset id must be a MongoDB ObjectId')
      .nullable()
      .optional(),
  })
  .strict()
  .default({});

const fieldSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, 'Field id is required')
      .max(80, 'Field id is too long')
      .regex(/^[A-Za-z0-9_-]+$/, 'Field id must be alphanumeric, _ or -'),
    type: z.enum(FIELD_TYPES, {
      errorMap: () => ({ message: 'Unsupported field type' }),
    }),
    key: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9_]+$/, 'Field key must be lowercase letters, numbers, or underscores')
      .optional(),
    label: z.string().trim().max(300).optional().default(''),
    placeholder: z.string().max(300).optional().default(''),
    helpText: z.string().max(500).optional().default(''),
    required: z.boolean().optional().default(false),
    order: z.number().int().optional().default(0),
    sectionId: z.string().trim().max(80).nullable().optional().default(null),
    options: z.array(optionSchema).optional().default([]),
    validation: validationRulesSchema,
    visibility: visibilitySchema,
    settings: fieldSettingsSchema,
  })
  .strict()
  .superRefine((field, ctx) => {
    if (!PRESENTATION_TYPES.has(field.type)) {
      if (!field.key || field.key.length === 0) {
        ctx.addIssue({
          path: ['key'],
          code: z.ZodIssueCode.custom,
          message: 'Field key is required for input fields',
        });
      }
    }
    if (OPTIONED_TYPES.has(field.type)) {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({
          path: ['options'],
          code: z.ZodIssueCode.custom,
          message: 'At least one option is required for this field type',
        });
      } else {
        const seen = new Set();
        field.options.forEach((opt, idx) => {
          if (seen.has(opt.key)) {
            ctx.addIssue({
              path: ['options', idx, 'key'],
              code: z.ZodIssueCode.custom,
              message: `Duplicate option key "${opt.key}"`,
            });
          }
          seen.add(opt.key);
        });
      }
    } else if (field.options && field.options.length > 0) {
      ctx.addIssue({
        path: ['options'],
        code: z.ZodIssueCode.custom,
        message: 'Options are not allowed for this field type',
      });
    }
  });

const sectionSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/, 'Section id must be alphanumeric, _ or -'),
    title: z.string().trim().max(200).optional().default(''),
    description: z.string().max(500).optional().default(''),
    order: z.number().int().optional().default(0),
  })
  .strict();

const logicActionSchema = z
  .object({
    type: z.enum([...VISIBILITY_ACTION_TYPES, ...NAVIGATION_ACTION_TYPES, ...END_ACTION_TYPES]),
    target: z.string().trim().max(80).nullable().optional().default(null),
  })
  .strict();

const logicRuleSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/, 'Logic rule id must be alphanumeric, _ or -'),
    name: z.string().trim().max(200).optional().default(''),
    type: z.enum(LOGIC_RULE_TYPES),
    targetFieldId: z.string().trim().max(80).nullable().optional().default(null),
    targetSectionId: z.string().trim().max(80).nullable().optional().default(null),
    conditions: z.array(conditionSchema).min(1, 'Logic rule needs at least one condition'),
    conditionMode: z.enum(CONDITION_MODES).default('all'),
    action: logicActionSchema,
  })
  .strict();

const layoutSchema = z
  .object({
    mode: z.enum(['single_page', 'paginated']).default('single_page'),
    showProgress: z.boolean().default(true),
  })
  .strict()
  .default({ mode: 'single_page', showProgress: true });

/**
 * Returns the set of operators that are valid for the given field type. We
 * stay permissive (text-style operators work on almost anything that has a
 * string representation) but block obvious mismatches like `greater_than` on
 * a checkbox group.
 */
const operatorsForField = (field) => {
  if (!field) return new Set();
  switch (field.type) {
    case 'number':
    case 'rating':
    case 'nps':
    case 'date':
    case 'time':
      // Date/time are stored as strings but compared lexicographically using
      // YYYY-MM-DD / HH:MM, which sorts correctly — so all operators apply.
      return new Set(LOGIC_OPERATORS);
    case 'checkbox':
    case 'yes_no':
      return new Set(['equals', 'not_equals', 'is_empty', 'is_not_empty']);
    case 'checkbox_group':
      return new Set(['contains', 'not_contains', 'is_empty', 'is_not_empty']);
    case 'select':
    case 'radio_group':
    case 'short_text':
    case 'long_text':
    case 'email':
    case 'phone':
    case 'hidden':
      return new Set([
        'equals',
        'not_equals',
        'contains',
        'not_contains',
        'is_empty',
        'is_not_empty',
      ]);
    default:
      // Presentational and file-upload fields can't be used as logic sources.
      return new Set();
  }
};

/**
 * Returns true when the condition `value` looks numeric. Used to flag
 * obviously broken numeric comparisons. We don't try to coerce arbitrary
 * strings — that's the engine's job at runtime.
 */
const looksNumeric = (value) =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));

const validateConditions = ({ ctx, conditions, basePath, fieldsById, ownerFieldId = null }) => {
  conditions.forEach((cond, condIdx) => {
    const sourcePath = [...basePath, condIdx];
    const source = fieldsById.get(cond.fieldId);
    if (!source) {
      ctx.addIssue({
        path: [...sourcePath, 'fieldId'],
        code: z.ZodIssueCode.custom,
        message: `Condition references unknown field "${cond.fieldId}"`,
      });
      return;
    }
    if (ownerFieldId && source.id === ownerFieldId) {
      ctx.addIssue({
        path: [...sourcePath, 'fieldId'],
        code: z.ZodIssueCode.custom,
        message: 'A field cannot reference itself in its visibility conditions',
      });
    }
    if (PRESENTATION_TYPES.has(source.type)) {
      ctx.addIssue({
        path: [...sourcePath, 'fieldId'],
        code: z.ZodIssueCode.custom,
        message: `Field "${cond.fieldId}" cannot be used as a logic source`,
      });
      return;
    }
    const allowed = operatorsForField(source);
    if (!allowed.has(cond.operator)) {
      ctx.addIssue({
        path: [...sourcePath, 'operator'],
        code: z.ZodIssueCode.custom,
        message: `Operator "${cond.operator}" is not supported for field type "${source.type}"`,
      });
      return;
    }
    if (!NO_VALUE_OPERATORS.has(cond.operator)) {
      if (cond.value === undefined || cond.value === null || cond.value === '') {
        ctx.addIssue({
          path: [...sourcePath, 'value'],
          code: z.ZodIssueCode.custom,
          message: 'Condition value is required',
        });
        return;
      }
      if (NUMERIC_ONLY_OPERATORS.has(cond.operator)) {
        if (NUMERIC_COMPARABLE_TYPES.has(source.type) && !looksNumeric(cond.value)) {
          ctx.addIssue({
            path: [...sourcePath, 'value'],
            code: z.ZodIssueCode.custom,
            message: 'Numeric comparison requires a numeric value',
          });
        }
      }
      if (OPTIONED_TYPES.has(source.type) && cond.operator === 'equals') {
        const allowedKeys = new Set((source.options ?? []).map((opt) => opt.key));
        if (typeof cond.value === 'string' && !allowedKeys.has(cond.value)) {
          ctx.addIssue({
            path: [...sourcePath, 'value'],
            code: z.ZodIssueCode.custom,
            message: `Value "${cond.value}" is not an option of field "${source.id}"`,
          });
        }
      }
    }
  });
};

/**
 * Detects cycles in navigation rules. We build a directed graph of
 * `from -> to` edges and run a DFS, where `from` is the field that owns the
 * jump (the field whose value triggers the jump, taken as the highest fieldId
 * of the conditions) and `to` is the jump target. If a cycle is found we
 * return the offending rule ids.
 */
const detectNavigationCycle = (logicRules, fieldsById) => {
  const edges = new Map();
  for (const rule of logicRules) {
    if (rule.type !== 'navigation') continue;
    if (rule.action.type !== 'jump_to_field') continue;
    const target = rule.action.target;
    if (!target || !fieldsById.has(target)) continue;
    for (const cond of rule.conditions) {
      if (!fieldsById.has(cond.fieldId)) continue;
      if (!edges.has(cond.fieldId)) edges.set(cond.fieldId, new Set());
      edges.get(cond.fieldId).add(target);
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  for (const node of edges.keys()) color.set(node, WHITE);

  const dfs = (node) => {
    color.set(node, GRAY);
    for (const next of edges.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE) {
        if (!color.has(next)) color.set(next, WHITE);
        if (dfs(next)) return true;
      }
    }
    color.set(node, BLACK);
    return false;
  };

  for (const node of edges.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE && dfs(node)) return true;
  }
  return false;
};

export const formSchemaSchema = z
  .object({
    fields: z.array(fieldSchema).default([]),
    sections: z.array(sectionSchema).optional().default([]),
    logicRules: z.array(logicRuleSchema).optional().default([]),
    layout: layoutSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const fieldsById = new Map();
    const sectionIds = new Set();
    const seenFieldKeys = new Set();

    value.fields.forEach((field, idx) => {
      if (fieldsById.has(field.id)) {
        ctx.addIssue({
          path: ['fields', idx, 'id'],
          code: z.ZodIssueCode.custom,
          message: `Duplicate field id "${field.id}"`,
        });
      }
      fieldsById.set(field.id, field);

      if (field.key) {
        if (seenFieldKeys.has(field.key)) {
          ctx.addIssue({
            path: ['fields', idx, 'key'],
            code: z.ZodIssueCode.custom,
            message: `Duplicate field key "${field.key}"`,
          });
        }
        seenFieldKeys.add(field.key);
      }
    });

    value.sections.forEach((section, idx) => {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({
          path: ['sections', idx, 'id'],
          code: z.ZodIssueCode.custom,
          message: `Duplicate section id "${section.id}"`,
        });
      }
      sectionIds.add(section.id);
    });

    value.fields.forEach((field, idx) => {
      if (field.sectionId && !sectionIds.has(field.sectionId)) {
        ctx.addIssue({
          path: ['fields', idx, 'sectionId'],
          code: z.ZodIssueCode.custom,
          message: `Field references unknown section "${field.sectionId}"`,
        });
      }

      const conditions = field.visibility?.conditions ?? [];
      if (field.visibility?.mode && field.visibility.mode !== 'always' && conditions.length === 0) {
        ctx.addIssue({
          path: ['fields', idx, 'visibility', 'conditions'],
          code: z.ZodIssueCode.custom,
          message: 'Visibility rules need at least one condition',
        });
      }
      validateConditions({
        ctx,
        conditions,
        basePath: ['fields', idx, 'visibility', 'conditions'],
        fieldsById,
        ownerFieldId: field.id,
      });
    });

    const logicIds = new Set();
    value.logicRules.forEach((rule, idx) => {
      if (logicIds.has(rule.id)) {
        ctx.addIssue({
          path: ['logicRules', idx, 'id'],
          code: z.ZodIssueCode.custom,
          message: `Duplicate logic rule id "${rule.id}"`,
        });
      }
      logicIds.add(rule.id);

      validateConditions({
        ctx,
        conditions: rule.conditions,
        basePath: ['logicRules', idx, 'conditions'],
        fieldsById,
      });

      const actionType = rule.action.type;
      if (rule.type === 'visibility') {
        if (!VISIBILITY_ACTION_TYPES.includes(actionType)) {
          ctx.addIssue({
            path: ['logicRules', idx, 'action', 'type'],
            code: z.ZodIssueCode.custom,
            message: 'Visibility rules must use show or hide actions',
          });
        }
        if (!rule.targetFieldId) {
          ctx.addIssue({
            path: ['logicRules', idx, 'targetFieldId'],
            code: z.ZodIssueCode.custom,
            message: 'Visibility rules need a target field',
          });
        } else if (!fieldsById.has(rule.targetFieldId)) {
          ctx.addIssue({
            path: ['logicRules', idx, 'targetFieldId'],
            code: z.ZodIssueCode.custom,
            message: `Visibility rule targets unknown field "${rule.targetFieldId}"`,
          });
        }
      } else if (rule.type === 'navigation') {
        if (!NAVIGATION_ACTION_TYPES.includes(actionType)) {
          ctx.addIssue({
            path: ['logicRules', idx, 'action', 'type'],
            code: z.ZodIssueCode.custom,
            message: 'Navigation rules must use jump_to_field, jump_to_section, or jump_to_page',
          });
        }
        const target = rule.action.target;
        if (!target) {
          ctx.addIssue({
            path: ['logicRules', idx, 'action', 'target'],
            code: z.ZodIssueCode.custom,
            message: 'Navigation rules need an action target',
          });
        } else if (actionType === 'jump_to_field' && !fieldsById.has(target)) {
          ctx.addIssue({
            path: ['logicRules', idx, 'action', 'target'],
            code: z.ZodIssueCode.custom,
            message: `Navigation rule targets unknown field "${target}"`,
          });
        } else if (actionType === 'jump_to_section' && !sectionIds.has(target)) {
          ctx.addIssue({
            path: ['logicRules', idx, 'action', 'target'],
            code: z.ZodIssueCode.custom,
            message: `Navigation rule targets unknown section "${target}"`,
          });
        } else if (actionType === 'jump_to_page') {
          const pageNumber = Number(target);
          if (!Number.isInteger(pageNumber) || pageNumber < 1) {
            ctx.addIssue({
              path: ['logicRules', idx, 'action', 'target'],
              code: z.ZodIssueCode.custom,
              message: 'jump_to_page target must be a positive integer',
            });
          }
        }
      } else if (rule.type === 'end') {
        if (!END_ACTION_TYPES.includes(actionType)) {
          ctx.addIssue({
            path: ['logicRules', idx, 'action', 'type'],
            code: z.ZodIssueCode.custom,
            message: 'End rules must use end_survey',
          });
        }
      }
    });

    if (detectNavigationCycle(value.logicRules, fieldsById)) {
      ctx.addIssue({
        path: ['logicRules'],
        code: z.ZodIssueCode.custom,
        message: 'Navigation rules form a cycle',
      });
    }
  });

/**
 * Default empty schema returned for newly-created draft surveys. Keeps the
 * shape stable so the frontend builder can render immediately without
 * defensive checks.
 */
export const emptyFormSchema = () => ({
  fields: [],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

/**
 * Default visibility shape used when seeding a brand-new field.
 */
export const defaultVisibility = () => ({
  mode: 'always',
  conditionMode: 'all',
  conditions: [],
});

/**
 * Validates a form schema payload. Returns the parsed and normalised schema
 * (defaults applied, untrusted keys stripped) on success; throws a
 * `ZodError` otherwise, which the global error handler converts to a 422.
 */
export const parseFormSchema = (input) => {
  if (input === null || input === undefined) {
    return emptyFormSchema();
  }
  return formSchemaSchema.parse(input);
};
