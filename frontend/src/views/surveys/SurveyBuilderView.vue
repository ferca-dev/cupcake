<script setup>
// Top-level builder view. Orchestrates:
//   - hydrating the builder store with the survey on mount
//   - the three-pane layout (sidebar / canvas / inspector)
//   - the topbar actions: back, status, validation summary, save, publish
//   - unsaved-change protection via `beforeRouteLeave` and the browser
//     beforeunload event
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';

import { useBuilderStore } from '../../stores/builder.store.js';
import { useI18n } from '../../i18n/index.js';
import { AppAlert, AppBadge, AppButton } from '../../components/ui/index.js';
import BuilderSidebar from '../../components/builder/BuilderSidebar.vue';
import BuilderCanvas from '../../components/builder/BuilderCanvas.vue';
import BuilderInspector from '../../components/builder/BuilderInspector.vue';
import { computeFieldVisibility } from '../../features/logic/logic-engine.js';

const route = useRoute();
const router = useRouter();
const builder = useBuilderStore();
const { t } = useI18n();

const {
  survey,
  schema,
  selectedFieldId,
  selectedField,
  isDirty,
  isLoading,
  isSaving,
  isPublishing,
  validationIssues,
  lastError,
  previewMode,
} = storeToRefs(builder);

const loadError = ref(null);
const generalError = ref(null);

const surveyId = computed(() => route.params.id);
const surveyStatus = computed(() => survey.value?.status ?? null);

const fieldIssueIds = computed(() => {
  const ids = new Set();
  for (const issue of validationIssues.value) {
    if (issue.path?.[0] !== 'fields') continue;
    const index = issue.path?.[1];
    const field = schema.value.fields[index];
    if (field) ids.add(field.id);
  }
  return ids;
});

const selectedFieldIssues = computed(() => {
  if (!selectedField.value) return [];
  const index = schema.value.fields.findIndex((field) => field.id === selectedField.value.id);
  if (index < 0) return [];
  return validationIssues.value.filter(
    (issue) => issue.path?.[0] === 'fields' && issue.path?.[1] === index,
  );
});

const headerIssue = computed(() => {
  if (validationIssues.value.length === 0) return null;
  if (validationIssues.value.length === 1) {
    return validationIssues.value[0].message;
  }
  return t('builder.header.issues', { count: validationIssues.value.length });
});

// Empty answer snapshot used by the canvas preview. Hidden-by-logic styling
// reflects what the form will look like before the respondent has answered
// anything, which is the most useful default while editing.
const previewAnswers = computed(() => ({}));

const previewVisibility = computed(() =>
  computeFieldVisibility(schema.value, previewAnswers.value),
);

const hiddenFieldIds = computed(() => {
  const set = new Set();
  for (const [fieldId, visible] of previewVisibility.value.entries()) {
    if (!visible) set.add(fieldId);
  }
  return set;
});

const statusBadgeVariant = computed(() => {
  switch (surveyStatus.value) {
    case 'published':
      return 'success';
    case 'paused':
      return 'warning';
    case 'archived':
      return 'neutral';
    default:
      return 'info';
  }
});

const previewModes = [
  { value: 'desktop', label: t('builder.header.previewDesktop') },
  { value: 'tablet', label: t('builder.header.previewTablet') },
  { value: 'mobile', label: t('builder.header.previewMobile') },
];

const beforeUnloadHandler = (event) => {
  if (!builder.isDirty) return undefined;
  event.preventDefault();
  // Modern browsers display their own copy; some still need a returnValue.
  event.returnValue = '';
  return '';
};

onMounted(async () => {
  if (!surveyId.value) return;
  try {
    await builder.loadSurvey(surveyId.value);
  } catch (err) {
    loadError.value = err?.message ?? t('builder.errors.loadFailed');
  }
  window.addEventListener('beforeunload', beforeUnloadHandler);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  builder.reset();
});

onBeforeRouteLeave((to, from, next) => {
  if (!builder.isDirty) {
    next();
    return;
  }
  const proceed = window.confirm(t('builder.unsaved.confirm'));
  if (proceed) next();
  else next(false);
});

watch(surveyId, async (next, prev) => {
  if (!next || next === prev) return;
  loadError.value = null;
  try {
    await builder.loadSurvey(next);
  } catch (err) {
    loadError.value = err?.message ?? t('builder.errors.loadFailed');
  }
});

const onAddField = (type) => {
  builder.addField(type);
  generalError.value = null;
};

const onAddFieldAtIndex = ({ type, index }) => {
  const created = builder.addField(type);
  if (!created) return;
  const currentIndex = builder.schema.fields.findIndex((field) => field.id === created.id);
  if (currentIndex >= 0 && currentIndex !== index) {
    const safeTarget = Math.min(index, builder.schema.fields.length - 1);
    builder.reorderFields(currentIndex, safeTarget);
  }
};

const onReorder = ({ sourceIndex, targetIndex }) => {
  builder.reorderFields(sourceIndex, targetIndex);
};

const onSelectField = (fieldId) => builder.selectField(fieldId);
const onClearSelection = () => builder.selectField(null);
const onRemoveField = (fieldId) => builder.removeField(fieldId);
const onDuplicateField = (fieldId) => builder.duplicateField(fieldId);

const onUpdateField = (patch) => {
  if (!selectedField.value) return;
  builder.updateField(selectedField.value.id, patch);
};

const onAddOption = () => {
  if (!selectedField.value) return;
  builder.addOption(selectedField.value.id);
};

const onUpdateOption = ({ optionId, payload }) => {
  if (!selectedField.value) return;
  builder.updateOption(selectedField.value.id, optionId, payload);
};

const onRemoveOption = (optionId) => {
  if (!selectedField.value) return;
  builder.removeOption(selectedField.value.id, optionId);
};

const onUpdateLayout = (patch) => {
  if ('mode' in patch) builder.setLayoutMode(patch.mode);
  if ('showProgress' in patch) builder.setShowProgress(patch.showProgress);
};

const onUpdateVisibility = (visibility) => {
  if (!selectedField.value) return;
  builder.setFieldVisibility(selectedField.value.id, visibility);
};

const onAddLogicRule = () => builder.addLogicRule();
const onUpdateLogicRule = ({ ruleId, patch }) => builder.updateLogicRule(ruleId, patch);
const onRemoveLogicRule = (ruleId) => builder.removeLogicRule(ruleId);

const onUpdateMetadata = async (payload) => {
  try {
    generalError.value = null;
    await builder.saveMetadata(payload);
  } catch (err) {
    generalError.value = err?.message ?? t('builder.errors.saveFailed');
  }
};

const onPreviewModeChange = (event) => builder.setPreviewMode(event.target.value);

const onSave = async () => {
  try {
    generalError.value = null;
    await builder.saveDraft();
  } catch (err) {
    if (err?.code === 'CLIENT_VALIDATION_ERROR') {
      generalError.value = t('builder.errors.invalidSchema');
    } else {
      generalError.value = err?.message ?? t('builder.errors.saveFailed');
    }
  }
};

const onPublish = async () => {
  try {
    generalError.value = null;
    await builder.publishSurvey();
  } catch (err) {
    if (err?.code === 'CLIENT_VALIDATION_ERROR') {
      generalError.value = t('builder.errors.invalidSchema');
    } else {
      generalError.value = err?.message ?? t('builder.errors.publishFailed');
    }
  }
};

const goBack = () => {
  if (builder.isDirty) {
    const proceed = window.confirm(t('builder.unsaved.confirm'));
    if (!proceed) return;
  }
  router.push({ name: 'surveys.list' });
};

watch(lastError, (value) => {
  if (value && !generalError.value) generalError.value = value;
});
</script>

<template>
  <section class="survey-builder">
    <header class="survey-builder__topbar">
      <div class="survey-builder__top-left">
        <AppButton variant="ghost" size="sm" @click="goBack">
          ← {{ t('builder.header.back') }}
        </AppButton>
        <div class="survey-builder__title-block">
          <h2 class="survey-builder__title">{{ survey?.title ?? t('builder.header.loading') }}</h2>
          <div class="survey-builder__meta">
            <AppBadge v-if="surveyStatus" :variant="statusBadgeVariant">{{
              surveyStatus
            }}</AppBadge>
            <span v-if="isDirty" class="survey-builder__dirty">{{
              t('builder.header.unsaved')
            }}</span>
            <span v-else class="survey-builder__saved">{{ t('builder.header.saved') }}</span>
          </div>
        </div>
      </div>

      <div class="survey-builder__top-right">
        <label class="survey-builder__preview-mode">
          <span>{{ t('builder.header.preview') }}</span>
          <select :value="previewMode" @change="onPreviewModeChange">
            <option v-for="mode in previewModes" :key="mode.value" :value="mode.value">
              {{ mode.label }}
            </option>
          </select>
        </label>
        <AppButton
          variant="secondary"
          :loading="isSaving"
          :disabled="!isDirty || isPublishing"
          @click="onSave"
        >
          {{ t('builder.header.save') }}
        </AppButton>
        <AppButton
          variant="primary"
          :loading="isPublishing"
          :disabled="isSaving || schema.fields.length === 0"
          @click="onPublish"
        >
          {{ t('builder.header.publish') }}
        </AppButton>
      </div>
    </header>

    <div v-if="loadError" class="survey-builder__alert">
      <AppAlert variant="error">{{ loadError }}</AppAlert>
    </div>

    <div v-if="headerIssue || generalError" class="survey-builder__alert">
      <AppAlert v-if="generalError" variant="error">{{ generalError }}</AppAlert>
      <AppAlert v-if="headerIssue" variant="warning">{{ headerIssue }}</AppAlert>
    </div>

    <div class="survey-builder__workspace" :class="{ 'is-loading': isLoading }">
      <BuilderSidebar :disabled="isLoading || surveyStatus === 'archived'" @add="onAddField" />

      <BuilderCanvas
        :fields="schema.fields"
        :selected-field-id="selectedFieldId"
        :field-issue-ids="fieldIssueIds"
        :preview-mode="previewMode"
        :hidden-field-ids="hiddenFieldIds"
        @select-field="onSelectField"
        @duplicate-field="onDuplicateField"
        @remove-field="onRemoveField"
        @add-field="onAddFieldAtIndex"
        @reorder-fields="onReorder"
        @clear-selection="onClearSelection"
      />

      <BuilderInspector
        :field="selectedField"
        :field-issues="selectedFieldIssues"
        :layout="schema.layout"
        :survey-title="survey?.title ?? ''"
        :survey-description="survey?.description ?? ''"
        :survey-slug="survey?.slug ?? ''"
        :is-saving-metadata="isSaving"
        :fields="schema.fields"
        :sections="schema.sections"
        :logic-rules="schema.logicRules"
        :schema-issues="validationIssues"
        @update-field="onUpdateField"
        @add-option="onAddOption"
        @update-option="onUpdateOption"
        @remove-option="onRemoveOption"
        @update-layout="onUpdateLayout"
        @update-metadata="onUpdateMetadata"
        @update-visibility="onUpdateVisibility"
        @add-logic-rule="onAddLogicRule"
        @update-logic-rule="onUpdateLogicRule"
        @remove-logic-rule="onRemoveLogicRule"
      />
    </div>
  </section>
</template>

<style scoped>
.survey-builder {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--layout-topbar-height) - var(--space-6) * 2);
  min-height: 36rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.survey-builder__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.survey-builder__top-left,
.survey-builder__top-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.survey-builder__title-block {
  display: flex;
  flex-direction: column;
}

.survey-builder__title {
  margin: 0;
  font-size: var(--font-size-md);
}

.survey-builder__meta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.survey-builder__dirty {
  color: var(--color-warning-700);
}

.survey-builder__saved {
  color: var(--color-success-700);
}

.survey-builder__preview-mode {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.survey-builder__preview-mode select {
  font: inherit;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.5rem;
}

.survey-builder__alert {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.survey-builder__workspace {
  flex: 1;
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr) 22rem;
  min-height: 0;
}

@media (min-width: 1600px) {
  .survey-builder__workspace {
    grid-template-columns: 18rem minmax(0, 1fr) 26rem;
  }
}

.survey-builder__workspace.is-loading {
  opacity: 0.7;
  pointer-events: none;
}

@media (max-width: 1100px) {
  .survey-builder__workspace {
    grid-template-columns: 13rem 1fr 18rem;
  }
}

@media (max-width: 900px) {
  .survey-builder {
    height: auto;
  }
  .survey-builder__workspace {
    grid-template-columns: 1fr;
  }
  .survey-builder__workspace > * {
    border: 0;
    border-top: 1px solid var(--color-border);
  }
}
</style>
