<script setup>
import { computed, nextTick, ref } from 'vue';
import { useI18n } from '../../i18n/index.js';
import { isInputField, validateAnswers } from '../../features/public-form/answers.js';
import { choiceValue } from '../../features/public-form/choice-value.js';
import { computeFieldVisibility } from '../../features/logic/logic-engine.js';
import PublicFieldRenderer from './PublicFieldRenderer.vue';

const props = defineProps({
  schema: { type: Object, default: null },
  answers: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:answer']);
const { t } = useI18n();
const root = ref(null);
const visibility = computed(() => computeFieldVisibility(props.schema, props.answers));
const fields = computed(() =>
  (props.schema?.fields ?? []).filter((field) => visibility.value.get(field.id) !== false),
);
const questions = computed(() => fields.value.filter(isInputField));
const numbers = computed(
  () => new Map(questions.value.map((field, index) => [field.id, index + 1])),
);
const invalidAnswers = computed(() => validateAnswers(props.schema, props.answers, t));
const isAnswered = (field) => {
  const value = choiceValue(props.answers[field.id]);
  if (value == null || invalidAnswers.value[field.id]) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((entry) => String(entry).trim().length > 0);
  return true;
};
const completed = computed(() => questions.value.filter(isAnswered).length);
const progress = computed(() =>
  questions.value.length ? Math.round((completed.value / questions.value.length) * 100) : 0,
);
const nextPending = computed(() => questions.value.find((field) => !isAnswered(field)));
const errors = computed(() => questions.value.filter((field) => props.errors[field.id]));
const showProgress = computed(
  () => props.schema?.layout?.showProgress !== false && questions.value.length > 0,
);

const focusField = async (id) => {
  await nextTick();
  // Match the attribute directly: published field IDs need not be CSS selectors.
  const field = [...(root.value?.querySelectorAll('[data-field-id]') ?? [])].find(
    (element) => element.dataset.fieldId === id,
  );
  if (!field) return;
  const control = field.querySelector(
    'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)',
  );
  (control ?? field).focus({ preventScroll: true });
  field.scrollIntoView?.({
    block: 'start',
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
  });
};
const focusFirstError = () => errors.value[0] && focusField(errors.value[0].id);
defineExpose({ focusFirstError });
</script>

<template>
  <div ref="root" class="survey-fields">
    <div v-if="showProgress" class="survey-fields__progress">
      <div class="survey-fields__progress-heading">
        <span class="survey-fields__count">{{
          t('publicForm.progressCount', { completed, total: questions.length })
        }}</span>
        <button
          v-if="nextPending"
          type="button"
          class="survey-fields__continue"
          :disabled="disabled"
          @click="focusField(nextPending.id)"
        >
          {{ t('publicForm.nextPending') }} <span aria-hidden="true">↓</span>
        </button>
        <span v-else class="survey-fields__complete">{{ t('publicForm.allAnswered') }}</span>
      </div>
      <div
        class="survey-fields__track"
        role="progressbar"
        :aria-label="t('publicForm.progressLabel')"
        :aria-valuenow="completed"
        :aria-valuemax="questions.length"
        :aria-valuemin="0"
        :aria-valuetext="t('publicForm.progressCount', { completed, total: questions.length })"
      >
        <span :style="{ width: `${progress}%` }" />
      </div>
    </div>

    <div v-if="errors.length" class="survey-fields__errors">
      <p>{{ t('publicForm.reviewCount', { count: errors.length }) }}</p>
      <ul>
        <li v-for="field in errors" :key="field.id">
          <button type="button" @click="focusField(field.id)">
            {{ numbers.get(field.id) }}. {{ field.label }}
          </button>
        </li>
      </ul>
    </div>

    <p v-if="questions.some((field) => field.required)" class="survey-fields__required-note">
      <span aria-hidden="true">*</span> {{ t('publicForm.requiredNote') }}
    </p>

    <fieldset
      class="survey-fields__list"
      :disabled="disabled"
      :aria-label="t('publicForm.questions')"
    >
      <PublicFieldRenderer
        v-for="field in fields"
        :key="field.id"
        :field="field"
        :number="numbers.get(field.id)"
        :model-value="answers[field.id]"
        :error="props.errors[field.id]"
        @update:model-value="(value) => emit('update:answer', field.id, value)"
      >
        <template #yes>{{ t('publicForm.yes') }}</template>
        <template #no>{{ t('publicForm.no') }}</template>
      </PublicFieldRenderer>
    </fieldset>
  </div>
</template>

<style scoped>
.survey-fields {
  min-width: 0;
}
.survey-fields__progress {
  position: sticky;
  top: var(--survey-progress-top, var(--space-3));
  z-index: 5;
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}
.survey-fields__progress-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  font-size: var(--font-size-sm);
}
.survey-fields__count {
  color: var(--color-text-muted);
}
.survey-fields__continue {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  min-height: 2.75rem;
  border: 0;
  background: transparent;
  font: inherit;
  font-weight: 600;
  color: var(--public-brand-primary, var(--color-primary-600));
  cursor: pointer;
}
.survey-fields__continue:disabled {
  opacity: 0.5;
  cursor: default;
}
.survey-fields__continue:focus-visible,
.survey-fields__errors button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}
.survey-fields__complete {
  color: var(--color-success-700);
  font-weight: 600;
}
.survey-fields__track {
  height: 0.375rem;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-surface-muted);
}
.survey-fields__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--public-brand-primary, var(--color-primary-600));
  transition: width 180ms ease;
}
.survey-fields__required-note {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.survey-fields__required-note span {
  color: var(--color-danger-600);
}
.survey-fields__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}
.survey-fields__errors {
  margin-bottom: var(--space-5);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-danger-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.survey-fields__errors p {
  font-weight: 600;
  color: var(--color-danger-700);
}
.survey-fields__errors ul {
  margin: 0;
  padding-left: var(--space-4);
}
.survey-fields__errors button {
  border: 0;
  background: transparent;
  padding: var(--space-2) 0;
  font: inherit;
  font-size: var(--font-size-sm);
  color: var(--color-danger-700);
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
}
@media (max-width: 480px) {
  .survey-fields__progress {
    padding: var(--space-3) var(--space-4);
  }
  .survey-fields__progress-heading {
    font-size: var(--font-size-xs);
    gap: var(--space-2);
  }
}
@media (prefers-reduced-motion: reduce) {
  .survey-fields__track span {
    transition: none;
  }
}
</style>
