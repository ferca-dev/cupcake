<script setup>
// Right-hand inspector. Reads the currently-selected field from the store
// and dispatches `updateField` / `*Option` actions when the user edits any
// property. Layout and form metadata also live here when no field is
// selected.
import { computed, ref, watch } from 'vue';

import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppButton,
  AppInput,
  AppSelect,
  AppTextarea,
} from '../ui/index.js';
import {
  FIELD_WIDTHS,
  OPTIONED_FIELD_TYPES,
  PRESENTATION_FIELD_TYPES,
  getFieldCatalogEntry,
} from '../../features/builder/builder.constants.js';
import { SUPPORTED_VISIBILITY_MODES } from '../../features/builder/builder.schema.js';
import ConditionBuilder from './ConditionBuilder.vue';
import LogicRuleEditor from './LogicRuleEditor.vue';

const props = defineProps({
  field: { type: Object, default: null },
  fieldIndex: { type: Number, default: -1 },
  fieldIssues: { type: Array, default: () => [] },
  layout: { type: Object, default: () => ({ mode: 'single_page', showProgress: true }) },
  surveyTitle: { type: String, default: '' },
  surveyDescription: { type: String, default: '' },
  surveySlug: { type: String, default: '' },
  isSavingMetadata: { type: Boolean, default: false },
  fields: { type: Array, default: () => [] },
  sections: { type: Array, default: () => [] },
  logicRules: { type: Array, default: () => [] },
  schemaIssues: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'update-field',
  'add-option',
  'update-option',
  'remove-option',
  'update-layout',
  'update-metadata',
  'update-visibility',
  'add-logic-rule',
  'update-logic-rule',
  'remove-logic-rule',
]);

const { t } = useI18n();

const widthOptions = FIELD_WIDTHS.map((width) => ({ value: width, label: width }));
const layoutModeOptions = [
  { value: 'single_page', label: t('builder.inspector.layout.singlePage') },
  { value: 'paginated', label: t('builder.inspector.layout.paginated') },
];

const visibilityModeOptions = computed(() =>
  SUPPORTED_VISIBILITY_MODES.map((mode) => ({
    value: mode,
    label: t(`builder.inspector.visibility.modes.${mode}`),
  })),
);

// Source fields for the selected field's visibility shortcut: every input
// field except the field itself and presentation/file-upload fields.
const sourceFieldsForSelected = computed(() => {
  if (!props.field) return [];
  return props.fields.filter(
    (field) =>
      field?.id &&
      field.id !== props.field.id &&
      !PRESENTATION_FIELD_TYPES.has(field.type) &&
      field.type !== 'file_upload',
  );
});

const visibilityIssues = computed(() => {
  if (!props.field) return [];
  return props.fieldIssues
    .filter((issue) => issue.path?.[2] === 'visibility')
    .map((issue) => ({ ...issue, path: issue.path.slice(3) }));
});

const conditionsIssues = computed(() =>
  visibilityIssues.value
    .filter((issue) => issue.path?.[0] === 'conditions')
    .map((issue) => ({ ...issue, path: issue.path.slice(1) })),
);

const isOptioned = computed(() => OPTIONED_FIELD_TYPES.has(props.field?.type));
const isPresentational = computed(() => PRESENTATION_FIELD_TYPES.has(props.field?.type));
const catalogEntry = computed(() =>
  props.field?.type ? getFieldCatalogEntry(props.field.type) : null,
);

const issueMessageByPath = (segment) =>
  props.fieldIssues
    .filter((issue) => issue.path?.[2] === segment)
    .map((issue) => issue.message)
    .join(' ');

const optionIssueMessage = (optionIdx, segment) =>
  props.fieldIssues
    .filter(
      (issue) =>
        issue.path?.[2] === 'options' &&
        issue.path?.[3] === optionIdx &&
        issue.path?.[4] === segment,
    )
    .map((issue) => issue.message)
    .join(' ');

const optionsIssue = computed(() => issueMessageByPath('options'));

const setField = (patch) => {
  emit('update-field', patch);
};

const setLayout = (patch) => emit('update-layout', patch);

const metadataDraft = ref({
  title: props.surveyTitle,
  description: props.surveyDescription,
  slug: props.surveySlug,
});

watch(
  () => [props.surveyTitle, props.surveyDescription, props.surveySlug],
  ([title, description, slug]) => {
    metadataDraft.value = { title, description, slug };
  },
);

const submitMetadata = () => {
  emit('update-metadata', {
    title: metadataDraft.value.title?.trim() ?? '',
    description: metadataDraft.value.description ?? '',
    slug: metadataDraft.value.slug?.trim() || undefined,
  });
};
</script>

<template>
  <aside class="builder-inspector" :aria-label="t('builder.inspector.title')">
    <header class="builder-inspector__header">
      <h3>{{ t('builder.inspector.title') }}</h3>
      <p v-if="field && catalogEntry" class="builder-inspector__subtitle">
        {{ catalogEntry.label }}
      </p>
      <p v-else class="builder-inspector__subtitle">{{ t('builder.inspector.noSelection') }}</p>
    </header>

    <div class="builder-inspector__body">
      <template v-if="field">
        <AppAlert v-if="fieldIssues.length > 0" variant="warning">
          {{ t('builder.inspector.issuesLeading') }}
          <ul class="builder-inspector__issue-list">
            <li v-for="(issue, idx) in fieldIssues" :key="idx">{{ issue.message }}</li>
          </ul>
        </AppAlert>

        <template v-if="!isPresentational">
          <AppInput
            :model-value="field.label"
            :label="t('builder.inspector.fields.label')"
            :error="issueMessageByPath('label')"
            @update:model-value="(value) => setField({ label: value })"
          />

          <AppInput
            :model-value="field.placeholder"
            :label="t('builder.inspector.fields.placeholder')"
            @update:model-value="(value) => setField({ placeholder: value })"
          />

          <AppInput
            :model-value="field.helpText"
            :label="t('builder.inspector.fields.helpText')"
            @update:model-value="(value) => setField({ helpText: value })"
          />

          <AppInput
            :model-value="field.key"
            :label="t('builder.inspector.fields.key')"
            :hint="t('builder.inspector.fields.keyHint')"
            :error="issueMessageByPath('key')"
            @update:model-value="(value) => setField({ key: value })"
          />

          <label class="builder-inspector__switch">
            <input
              type="checkbox"
              :checked="field.required"
              @change="(event) => setField({ required: event.target.checked })"
            />
            <span>{{ t('builder.inspector.fields.required') }}</span>
          </label>
        </template>

        <template v-else>
          <AppTextarea
            :model-value="field.label"
            :label="t('builder.inspector.fields.staticText')"
            :rows="3"
            @update:model-value="(value) => setField({ label: value })"
          />
        </template>

        <AppSelect
          :model-value="field.settings?.width"
          :label="t('builder.inspector.fields.width')"
          :options="widthOptions"
          @update:model-value="(value) => setField({ settings: { width: value } })"
        />

        <template v-if="field.type === 'image_block'">
          <AppInput
            :model-value="field.settings?.imageUrl ?? ''"
            :label="t('builder.inspector.fields.imageUrl')"
            @update:model-value="(value) => setField({ settings: { width: field.settings?.width, imageUrl: value } })"
          />
        </template>

        <template v-if="isOptioned">
          <section class="builder-inspector__options" :aria-label="t('builder.inspector.options.title')">
            <header class="builder-inspector__section-header">
              <h4>{{ t('builder.inspector.options.title') }}</h4>
              <AppButton variant="ghost" size="sm" @click="$emit('add-option')">
                + {{ t('builder.inspector.options.add') }}
              </AppButton>
            </header>
            <small v-if="optionsIssue" class="builder-inspector__inline-error" role="alert">
              {{ optionsIssue }}
            </small>
            <ul class="builder-inspector__option-list">
              <li
                v-for="(option, optionIdx) in field.options ?? []"
                :key="option.id"
                class="builder-inspector__option"
              >
                <AppInput
                  :model-value="option.label"
                  :label="t('builder.inspector.options.label')"
                  :error="optionIssueMessage(optionIdx, 'label')"
                  @update:model-value="(value) => $emit('update-option', { optionId: option.id, payload: { label: value } })"
                />
                <AppInput
                  :model-value="option.key"
                  :label="t('builder.inspector.options.key')"
                  :error="optionIssueMessage(optionIdx, 'key')"
                  @update:model-value="(value) => $emit('update-option', { optionId: option.id, payload: { key: value } })"
                />
                <AppButton
                  variant="ghost"
                  size="sm"
                  @click="$emit('remove-option', option.id)"
                >
                  {{ t('builder.inspector.options.remove') }}
                </AppButton>
              </li>
            </ul>
          </section>
        </template>

        <template v-if="!isPresentational && (field.type === 'short_text' || field.type === 'long_text' || field.type === 'email')">
          <section class="builder-inspector__validation" :aria-label="t('builder.inspector.validation.title')">
            <h4>{{ t('builder.inspector.validation.title') }}</h4>
            <AppInput
              type="number"
              :model-value="field.validation?.minLength ?? ''"
              :label="t('builder.inspector.validation.minLength')"
              @update:model-value="(value) => setField({ validation: { ...field.validation, minLength: value === '' ? null : Number(value) } })"
            />
            <AppInput
              type="number"
              :model-value="field.validation?.maxLength ?? ''"
              :label="t('builder.inspector.validation.maxLength')"
              @update:model-value="(value) => setField({ validation: { ...field.validation, maxLength: value === '' ? null : Number(value) } })"
            />
          </section>
        </template>

        <template v-if="!isPresentational && field.type === 'number'">
          <section class="builder-inspector__validation" :aria-label="t('builder.inspector.validation.title')">
            <h4>{{ t('builder.inspector.validation.title') }}</h4>
            <AppInput
              type="number"
              :model-value="field.validation?.min ?? ''"
              :label="t('builder.inspector.validation.min')"
              @update:model-value="(value) => setField({ validation: { ...field.validation, min: value === '' ? null : Number(value) } })"
            />
            <AppInput
              type="number"
              :model-value="field.validation?.max ?? ''"
              :label="t('builder.inspector.validation.max')"
              @update:model-value="(value) => setField({ validation: { ...field.validation, max: value === '' ? null : Number(value) } })"
            />
          </section>
        </template>

        <template v-if="!isPresentational">
          <section
            class="builder-inspector__visibility"
            :aria-label="t('builder.inspector.visibility.title')"
          >
            <h4>{{ t('builder.inspector.visibility.title') }}</h4>
            <AppSelect
              :model-value="field.visibility?.mode ?? 'always'"
              :label="t('builder.inspector.visibility.mode')"
              :options="visibilityModeOptions"
              @update:model-value="(mode) => $emit('update-visibility', { mode })"
            />
            <ConditionBuilder
              v-if="(field.visibility?.mode ?? 'always') !== 'always'"
              :conditions="field.visibility?.conditions ?? []"
              :condition-mode="field.visibility?.conditionMode ?? 'all'"
              :source-fields="sourceFieldsForSelected"
              :issues="conditionsIssues"
              @update:conditions="(conditions) => $emit('update-visibility', { conditions })"
              @update:condition-mode="(conditionMode) => $emit('update-visibility', { conditionMode })"
            />
          </section>
        </template>
      </template>

      <template v-else>
        <section class="builder-inspector__meta" :aria-label="t('builder.inspector.metadata.title')">
          <h4>{{ t('builder.inspector.metadata.title') }}</h4>
          <AppInput
            v-model="metadataDraft.title"
            :label="t('builder.inspector.metadata.title')"
            required
          />
          <AppTextarea
            v-model="metadataDraft.description"
            :label="t('builder.inspector.metadata.description')"
            :rows="3"
          />
          <AppInput
            v-model="metadataDraft.slug"
            :label="t('builder.inspector.metadata.slug')"
            :hint="t('builder.inspector.metadata.slugHint')"
          />
          <AppButton variant="secondary" size="sm" :loading="isSavingMetadata" @click="submitMetadata">
            {{ t('builder.inspector.metadata.save') }}
          </AppButton>
        </section>

        <section class="builder-inspector__layout" :aria-label="t('builder.inspector.layout.title')">
          <h4>{{ t('builder.inspector.layout.title') }}</h4>
          <AppSelect
            :model-value="layout.mode"
            :label="t('builder.inspector.layout.mode')"
            :options="layoutModeOptions"
            @update:model-value="(value) => setLayout({ mode: value })"
          />
          <label class="builder-inspector__switch">
            <input
              type="checkbox"
              :checked="layout.showProgress !== false"
              @change="(event) => setLayout({ showProgress: event.target.checked })"
            />
            <span>{{ t('builder.inspector.layout.showProgress') }}</span>
          </label>
        </section>

        <LogicRuleEditor
          :rules="logicRules"
          :fields="fields"
          :sections="sections"
          :issues="schemaIssues"
          @add="$emit('add-logic-rule')"
          @update="(payload) => $emit('update-logic-rule', payload)"
          @remove="(ruleId) => $emit('remove-logic-rule', ruleId)"
        />
      </template>
    </div>
  </aside>
</template>

<style scoped>
.builder-inspector {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  overflow-y: auto;
  height: 100%;
}

.builder-inspector__header {
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.builder-inspector__header h3 {
  margin: 0;
  font-size: var(--font-size-md);
}

.builder-inspector__subtitle {
  margin: var(--space-1) 0 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.builder-inspector__body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.builder-inspector__switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.builder-inspector__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.builder-inspector__section-header h4 {
  margin: 0;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.builder-inspector__inline-error {
  color: var(--color-danger-600);
  font-size: var(--font-size-xs);
}

.builder-inspector__option-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.builder-inspector__option {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.builder-inspector__validation,
.builder-inspector__meta,
.builder-inspector__layout,
.builder-inspector__visibility {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
}

.builder-inspector__validation h4,
.builder-inspector__meta h4,
.builder-inspector__layout h4,
.builder-inspector__visibility h4 {
  margin: 0;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.builder-inspector__issue-list {
  margin: var(--space-1) 0 0 var(--space-4);
  padding: 0;
}
</style>
