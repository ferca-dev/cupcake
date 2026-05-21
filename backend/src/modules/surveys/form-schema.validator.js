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

const VISIBILITY_MODES = ['always', 'show_when', 'hide_when'];

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

const conditionGroupSchema = z
  .object({
    all: z.array(conditionSchema).optional(),
    any: z.array(conditionSchema).optional(),
  })
  .strict()
  .refine(
    (group) => (group.all && group.all.length > 0) || (group.any && group.any.length > 0),
    { message: 'Condition group must contain at least one rule in all/any' },
  );

const visibilitySchema = z
  .object({
    mode: z.enum(VISIBILITY_MODES).default('always'),
    rules: z.array(conditionSchema).default([]),
  })
  .strict()
  .default({ mode: 'always', rules: [] });

const fieldSettingsSchema = z
  .object({
    width: z.enum(['full', 'half', 'third', 'quarter']).default('full'),
    imageUrl: z.string().max(2000).nullable().optional(),
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
    type: z.enum([
      'show',
      'hide',
      'require',
      'jump_to_field',
      'jump_to_section',
      'jump_to_page',
      'end_survey',
    ]),
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
    when: conditionGroupSchema,
    actions: z.array(logicActionSchema).min(1, 'Logic rule must have at least one action'),
  })
  .strict();

const layoutSchema = z
  .object({
    mode: z.enum(['single_page', 'paginated']).default('single_page'),
    showProgress: z.boolean().default(true),
  })
  .strict()
  .default({ mode: 'single_page', showProgress: true });

export const formSchemaSchema = z
  .object({
    fields: z.array(fieldSchema).default([]),
    sections: z.array(sectionSchema).optional().default([]),
    logicRules: z.array(logicRuleSchema).optional().default([]),
    layout: layoutSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const fieldIds = new Set();
    const fieldKeys = new Set();
    value.fields.forEach((field, idx) => {
      if (fieldIds.has(field.id)) {
        ctx.addIssue({
          path: ['fields', idx, 'id'],
          code: z.ZodIssueCode.custom,
          message: `Duplicate field id "${field.id}"`,
        });
      }
      fieldIds.add(field.id);

      if (field.key) {
        if (fieldKeys.has(field.key)) {
          ctx.addIssue({
            path: ['fields', idx, 'key'],
            code: z.ZodIssueCode.custom,
            message: `Duplicate field key "${field.key}"`,
          });
        }
        fieldKeys.add(field.key);
      }

      if (field.sectionId && !value.sections.some((s) => s.id === field.sectionId)) {
        ctx.addIssue({
          path: ['fields', idx, 'sectionId'],
          code: z.ZodIssueCode.custom,
          message: `Field references unknown section "${field.sectionId}"`,
        });
      }

      field.visibility?.rules?.forEach((rule, ruleIdx) => {
        if (!fieldIds.has(rule.fieldId) && !value.fields.some((f) => f.id === rule.fieldId)) {
          ctx.addIssue({
            path: ['fields', idx, 'visibility', 'rules', ruleIdx, 'fieldId'],
            code: z.ZodIssueCode.custom,
            message: `Visibility rule references unknown field "${rule.fieldId}"`,
          });
        }
      });
    });

    const sectionIds = new Set();
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

      const conditions = [...(rule.when.all ?? []), ...(rule.when.any ?? [])];
      conditions.forEach((cond, condIdx) => {
        if (!value.fields.some((f) => f.id === cond.fieldId)) {
          ctx.addIssue({
            path: ['logicRules', idx, 'when', condIdx, 'fieldId'],
            code: z.ZodIssueCode.custom,
            message: `Logic rule references unknown field "${cond.fieldId}"`,
          });
        }
      });
    });
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
