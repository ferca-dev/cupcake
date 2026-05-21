// Builder store. Owns the in-progress survey draft (schema + meta), tracks
// dirty state, and is the only place that talks to the surveys API for the
// builder view. The view layer stays declarative: it dispatches actions
// here, it doesn't mutate the schema in place.
//
// Drag/drop visual state is intentionally NOT kept on this store. The
// canvas component manages its own ephemeral indices and only calls
// `reorderFields` once a drop lands, so undo / persistence don't have to
// reason about half-finished gestures.

import { defineStore } from 'pinia';

import { surveyService } from '../services/survey.service.js';
import {
  PRESENTATION_FIELD_TYPES,
  OPTIONED_FIELD_TYPES,
  FIELD_WIDTHS,
} from '../features/builder/builder.constants.js';
import {
  buildDefaultField,
  buildEmptySchema,
  cloneFieldWithNewIds,
  generateOptionId,
  normalizeSchemaForApi,
  slugifyFieldKey,
  validateFormSchema,
} from '../features/builder/builder.schema.js';

const ALLOWED_FIELD_UPDATE_KEYS = new Set([
  'label',
  'placeholder',
  'helpText',
  'required',
  'key',
  'sectionId',
  'options',
  'validation',
  'visibility',
  'settings',
]);

const sanitizeFieldPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return {};
  const out = {};
  for (const key of Object.keys(payload)) {
    if (ALLOWED_FIELD_UPDATE_KEYS.has(key)) {
      out[key] = payload[key];
    }
  }
  return out;
};

const collectKeysExcept = (fields, exceptId) => {
  const set = new Set();
  for (const field of fields) {
    if (field.id === exceptId) continue;
    const key = typeof field.key === 'string' ? field.key.trim() : '';
    if (key) set.add(key);
  }
  return set;
};

const PREVIEW_MODES = ['desktop', 'tablet', 'mobile'];

export const useBuilderStore = defineStore('builder', {
  state: () => ({
    surveyId: null,
    selectedFieldId: null,
    schema: buildEmptySchema(),
    isDirty: false,
    previewMode: 'desktop',
    survey: null,
    isLoading: false,
    isSaving: false,
    isPublishing: false,
    lastSavedAt: null,
    lastError: null,
    validationIssues: [],
  }),

  getters: {
    fields: (state) => state.schema.fields,
    selectedField: (state) =>
      state.schema.fields.find((field) => field.id === state.selectedFieldId) ?? null,
    fieldCount: (state) => state.schema.fields.length,
    canPublish: (state) => state.schema.fields.length > 0 && !state.isDirty,
    isValid: (state) => state.validationIssues.length === 0,
    issuesForField: (state) => (fieldId) => {
      const index = state.schema.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return [];
      return state.validationIssues.filter(
        (issue) => issue.path?.[0] === 'fields' && issue.path?.[1] === index,
      );
    },
  },

  actions: {
    reset() {
      this.surveyId = null;
      this.selectedFieldId = null;
      this.schema = buildEmptySchema();
      this.isDirty = false;
      this.previewMode = 'desktop';
      this.survey = null;
      this.isLoading = false;
      this.isSaving = false;
      this.isPublishing = false;
      this.lastSavedAt = null;
      this.lastError = null;
      this.validationIssues = [];
    },

    setSurvey(survey) {
      this.survey = survey ?? null;
      this.surveyId = survey?.id ?? null;
      this.schema = survey?.currentDraftSchema
        ? this._hydrateSchema(survey.currentDraftSchema)
        : buildEmptySchema();
      this.selectedFieldId = this.schema.fields[0]?.id ?? null;
      this.isDirty = false;
      this.lastSavedAt = survey?.updatedAt ?? null;
      this.lastError = null;
      this.refreshValidation();
    },

    // ------------------------------------------------------------------
    // Local mutations
    // ------------------------------------------------------------------

    addField(type) {
      const existingKeys = collectKeysExcept(this.schema.fields, null);
      const field = buildDefaultField(type, {
        order: this.schema.fields.length + 1,
        existingKeys,
      });
      this.schema.fields = [...this.schema.fields, field];
      this.selectedFieldId = field.id;
      this._markDirty();
      return field;
    },

    selectField(fieldId) {
      if (fieldId === null) {
        this.selectedFieldId = null;
        return;
      }
      if (this.schema.fields.some((field) => field.id === fieldId)) {
        this.selectedFieldId = fieldId;
      }
    },

    removeField(fieldId) {
      const index = this.schema.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return;
      const next = this.schema.fields.slice();
      next.splice(index, 1);
      this.schema.fields = next;
      if (this.selectedFieldId === fieldId) {
        this.selectedFieldId = next[index]?.id ?? next[index - 1]?.id ?? null;
      }
      this._markDirty();
    },

    duplicateField(fieldId) {
      const index = this.schema.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return null;
      const original = this.schema.fields[index];
      const copy = cloneFieldWithNewIds(original);
      const existingKeys = collectKeysExcept(this.schema.fields, null);
      if (copy.key && !PRESENTATION_FIELD_TYPES.has(copy.type)) {
        copy.key = this._uniquifyKey(`${copy.key}_copy`, existingKeys);
      }
      copy.label = original.label ? `${original.label} (copy)` : copy.label;
      const next = this.schema.fields.slice();
      next.splice(index + 1, 0, copy);
      this.schema.fields = next;
      this.selectedFieldId = copy.id;
      this._markDirty();
      return copy;
    },

    updateField(fieldId, payload) {
      const sanitized = sanitizeFieldPayload(payload);
      const index = this.schema.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return;
      const current = this.schema.fields[index];
      const updated = { ...current };

      if ('label' in sanitized) updated.label = String(sanitized.label ?? '');
      if ('placeholder' in sanitized) updated.placeholder = String(sanitized.placeholder ?? '');
      if ('helpText' in sanitized) updated.helpText = String(sanitized.helpText ?? '');
      if ('required' in sanitized) updated.required = Boolean(sanitized.required);
      if ('sectionId' in sanitized) {
        updated.sectionId =
          typeof sanitized.sectionId === 'string' && sanitized.sectionId
            ? sanitized.sectionId
            : null;
      }
      if ('key' in sanitized && !PRESENTATION_FIELD_TYPES.has(updated.type)) {
        const raw = typeof sanitized.key === 'string' ? sanitized.key : '';
        updated.key = raw
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, '_')
          .slice(0, 60);
      }
      if ('options' in sanitized) {
        updated.options = Array.isArray(sanitized.options)
          ? sanitized.options.map((opt) => ({
              id: opt.id ?? generateOptionId(),
              key: typeof opt.key === 'string' ? opt.key : '',
              label: typeof opt.label === 'string' ? opt.label : '',
            }))
          : [];
      }
      if ('validation' in sanitized && sanitized.validation && typeof sanitized.validation === 'object') {
        updated.validation = {
          ...updated.validation,
          ...sanitized.validation,
        };
      }
      if ('visibility' in sanitized && sanitized.visibility && typeof sanitized.visibility === 'object') {
        updated.visibility = {
          mode: sanitized.visibility.mode ?? updated.visibility.mode ?? 'always',
          rules: Array.isArray(sanitized.visibility.rules)
            ? sanitized.visibility.rules
            : updated.visibility.rules,
        };
      }
      if ('settings' in sanitized && sanitized.settings && typeof sanitized.settings === 'object') {
        const width = FIELD_WIDTHS.includes(sanitized.settings.width)
          ? sanitized.settings.width
          : updated.settings.width;
        const imageUrl =
          'imageUrl' in sanitized.settings
            ? sanitized.settings.imageUrl || null
            : updated.settings.imageUrl;
        updated.settings = { width, imageUrl };
      }

      const next = this.schema.fields.slice();
      next[index] = updated;
      this.schema.fields = next;
      this._markDirty();
    },

    reorderFields(sourceIndex, targetIndex) {
      const fields = this.schema.fields;
      if (
        !Number.isInteger(sourceIndex) ||
        !Number.isInteger(targetIndex) ||
        sourceIndex < 0 ||
        sourceIndex >= fields.length ||
        targetIndex < 0 ||
        targetIndex >= fields.length ||
        sourceIndex === targetIndex
      ) {
        return;
      }
      const next = fields.slice();
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      this.schema.fields = next.map((field, idx) => ({ ...field, order: idx + 1 }));
      this._markDirty();
    },

    addOption(fieldId) {
      const index = this.schema.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return;
      const field = this.schema.fields[index];
      if (!OPTIONED_FIELD_TYPES.has(field.type)) return;
      const nextIndex = (field.options?.length ?? 0) + 1;
      const newOption = {
        id: generateOptionId(),
        key: this._uniquifyOptionKey(`option_${nextIndex}`, field.options ?? []),
        label: `Option ${nextIndex}`,
      };
      const nextFields = this.schema.fields.slice();
      nextFields[index] = {
        ...field,
        options: [...(field.options ?? []), newOption],
      };
      this.schema.fields = nextFields;
      this._markDirty();
    },

    updateOption(fieldId, optionId, payload) {
      const index = this.schema.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return;
      const field = this.schema.fields[index];
      const nextOptions = (field.options ?? []).map((opt) => {
        if (opt.id !== optionId) return opt;
        const updated = { ...opt };
        if (payload && typeof payload === 'object') {
          if ('label' in payload) updated.label = String(payload.label ?? '');
          if ('key' in payload) {
            updated.key = String(payload.key ?? '')
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9_]+/g, '_')
              .slice(0, 60);
          }
        }
        return updated;
      });
      const nextFields = this.schema.fields.slice();
      nextFields[index] = { ...field, options: nextOptions };
      this.schema.fields = nextFields;
      this._markDirty();
    },

    removeOption(fieldId, optionId) {
      const index = this.schema.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return;
      const field = this.schema.fields[index];
      const nextOptions = (field.options ?? []).filter((opt) => opt.id !== optionId);
      const nextFields = this.schema.fields.slice();
      nextFields[index] = { ...field, options: nextOptions };
      this.schema.fields = nextFields;
      this._markDirty();
    },

    setPreviewMode(mode) {
      if (PREVIEW_MODES.includes(mode)) this.previewMode = mode;
    },

    setLayoutMode(mode) {
      if (mode === 'single_page' || mode === 'paginated') {
        this.schema.layout = { ...this.schema.layout, mode };
        this._markDirty();
      }
    },

    setShowProgress(showProgress) {
      this.schema.layout = { ...this.schema.layout, showProgress: Boolean(showProgress) };
      this._markDirty();
    },

    validateSchema() {
      const issues = validateFormSchema(this.schema);
      this.validationIssues = issues;
      return issues;
    },

    refreshValidation() {
      this.validationIssues = validateFormSchema(this.schema);
    },

    // ------------------------------------------------------------------
    // Network
    // ------------------------------------------------------------------

    async loadSurvey(surveyId) {
      this.isLoading = true;
      this.lastError = null;
      try {
        const data = await surveyService.get(surveyId);
        this.setSurvey(data?.survey ?? null);
        return this.survey;
      } catch (err) {
        this.lastError = err?.message ?? 'Failed to load survey';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async createSurveyDraft({ title, description = null, slug = undefined }) {
      this.isSaving = true;
      this.lastError = null;
      try {
        const payload = {
          title,
          ...(description !== null && description !== undefined ? { description } : {}),
          ...(slug ? { slug } : {}),
          schema: buildEmptySchema(),
        };
        const data = await surveyService.create(payload);
        this.setSurvey(data?.survey ?? null);
        return this.survey;
      } catch (err) {
        this.lastError = err?.message ?? 'Failed to create survey';
        throw err;
      } finally {
        this.isSaving = false;
      }
    },

    async saveDraft() {
      if (!this.surveyId) {
        throw new Error('No survey loaded — call createSurveyDraft first');
      }
      const issues = this.validateSchema();
      if (issues.length > 0) {
        const error = new Error('Schema is invalid');
        error.code = 'CLIENT_VALIDATION_ERROR';
        error.details = issues;
        this.lastError = 'Fix validation issues before saving.';
        throw error;
      }
      this.isSaving = true;
      this.lastError = null;
      try {
        const payload = { schema: normalizeSchemaForApi(this.schema) };
        const data = await surveyService.update(this.surveyId, payload);
        this.setSurvey(data?.survey ?? null);
        return this.survey;
      } catch (err) {
        this.lastError = err?.message ?? 'Failed to save draft';
        throw err;
      } finally {
        this.isSaving = false;
      }
    },

    async saveMetadata({ title, description, slug }) {
      if (!this.surveyId) {
        throw new Error('No survey loaded');
      }
      this.isSaving = true;
      this.lastError = null;
      try {
        const payload = {};
        if (title !== undefined) payload.title = title;
        if (description !== undefined) payload.description = description;
        if (slug !== undefined) payload.slug = slug;
        const data = await surveyService.update(this.surveyId, payload);
        this.setSurvey(data?.survey ?? null);
        return this.survey;
      } catch (err) {
        this.lastError = err?.message ?? 'Failed to update survey';
        throw err;
      } finally {
        this.isSaving = false;
      }
    },

    async publishSurvey() {
      if (!this.surveyId) {
        throw new Error('No survey loaded — call createSurveyDraft first');
      }
      if (this.isDirty) {
        await this.saveDraft();
      } else {
        const issues = this.validateSchema();
        if (issues.length > 0) {
          const error = new Error('Schema is invalid');
          error.code = 'CLIENT_VALIDATION_ERROR';
          error.details = issues;
          this.lastError = 'Fix validation issues before publishing.';
          throw error;
        }
      }
      this.isPublishing = true;
      this.lastError = null;
      try {
        const data = await surveyService.publish(this.surveyId);
        if (data?.survey) {
          this.setSurvey(data.survey);
        }
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Failed to publish survey';
        throw err;
      } finally {
        this.isPublishing = false;
      }
    },

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    _markDirty() {
      this.isDirty = true;
      this.lastError = null;
      this.refreshValidation();
    },

    _uniquifyKey(desired, existingKeys) {
      const base = slugifyFieldKey(desired || 'field');
      if (!existingKeys.has(base)) return base;
      let i = 2;
      while (existingKeys.has(`${base}_${i}`)) i += 1;
      return `${base}_${i}`;
    },

    _uniquifyOptionKey(desired, options) {
      const taken = new Set(options.map((opt) => opt.key));
      const base = desired.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
      if (!taken.has(base)) return base;
      let i = 2;
      while (taken.has(`${base}_${i}`)) i += 1;
      return `${base}_${i}`;
    },

    /**
     * Hydrates a schema coming from the API into the shape the store needs.
     * The backend strips presentational keys and option ids; this puts them
     * back so the inspector and field components have something to bind to.
     */
    _hydrateSchema(rawSchema) {
      const base = buildEmptySchema();
      if (!rawSchema || typeof rawSchema !== 'object') return base;

      const fields = Array.isArray(rawSchema.fields) ? rawSchema.fields : [];
      base.fields = fields.map((field, idx) => ({
        id: field.id,
        type: field.type,
        key: typeof field.key === 'string' ? field.key : '',
        label: typeof field.label === 'string' ? field.label : '',
        placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
        helpText: typeof field.helpText === 'string' ? field.helpText : '',
        required: Boolean(field.required),
        order: typeof field.order === 'number' ? field.order : idx + 1,
        sectionId: field.sectionId ?? null,
        options: Array.isArray(field.options)
          ? field.options.map((opt) => ({
              id: opt.id ?? generateOptionId(),
              key: typeof opt.key === 'string' ? opt.key : '',
              label: typeof opt.label === 'string' ? opt.label : '',
            }))
          : [],
        validation: {
          minLength: field.validation?.minLength ?? null,
          maxLength: field.validation?.maxLength ?? null,
          min: field.validation?.min ?? null,
          max: field.validation?.max ?? null,
          regex: field.validation?.regex ?? null,
        },
        visibility: {
          mode: field.visibility?.mode ?? 'always',
          rules: Array.isArray(field.visibility?.rules) ? field.visibility.rules : [],
        },
        settings: {
          width: FIELD_WIDTHS.includes(field.settings?.width) ? field.settings.width : 'full',
          imageUrl: field.settings?.imageUrl ?? null,
        },
      }));

      if (Array.isArray(rawSchema.sections)) {
        base.sections = rawSchema.sections.map((section, idx) => ({
          id: section.id,
          title: typeof section.title === 'string' ? section.title : '',
          description: typeof section.description === 'string' ? section.description : '',
          order: typeof section.order === 'number' ? section.order : idx + 1,
        }));
      }
      if (Array.isArray(rawSchema.logicRules)) {
        base.logicRules = rawSchema.logicRules;
      }
      if (rawSchema.layout && typeof rawSchema.layout === 'object') {
        base.layout = {
          mode: rawSchema.layout.mode === 'paginated' ? 'paginated' : 'single_page',
          showProgress: rawSchema.layout.showProgress !== false,
        };
      }
      return base;
    },
  },
});
