<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { surveyorService } from '../../services/surveyor.service.js';
import { useI18n } from '../../i18n/index.js';
import {
  buildInitialAnswers,
  serializeAnswers,
  validateAnswers,
} from '../../features/public-form/answers.js';
import { computeFieldVisibility } from '../../features/logic/logic-engine.js';
import PublicFieldRenderer from '../../components/public-form/PublicFieldRenderer.vue';
import PublicThankYouView from '../public/PublicThankYouView.vue';
import { AppAlert, AppButton, AppCard, AppLoader } from '../../components/ui/index.js';
import { ApiError } from '../../services/apiClient.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const surveyId = computed(() => String(route.params.id ?? ''));
const survey = ref(null);
const schema = computed(() => survey.value?.version?.schema ?? null);
const answerState = reactive({});
const fieldErrors = reactive({});
const startedAt = ref(null);
const submittedResult = ref(null);

const loadState = reactive({ loading: true, error: null });
const submitState = reactive({ submitting: false, error: null });

const visibilityMap = computed(() => {
  if (!schema.value) return new Map();
  return computeFieldVisibility(schema.value, answerState);
});

const visibleFields = computed(() => {
  if (!schema.value) return [];
  return schema.value.fields.filter((field) => visibilityMap.value.get(field.id) !== false);
});

const hasFieldErrors = computed(() => Object.keys(fieldErrors).length > 0);

const resetAnswerState = (next) => {
  for (const key of Object.keys(answerState)) delete answerState[key];
  Object.assign(answerState, next);
};

const resetFieldErrors = () => {
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
};

const loadSurvey = async () => {
  loadState.loading = true;
  loadState.error = null;
  try {
    const data = await surveyorService.getSurvey(surveyId.value);
    survey.value = data?.survey ?? null;
    resetAnswerState(buildInitialAnswers(data?.survey?.version?.schema ?? null));
    resetFieldErrors();
    startedAt.value = new Date();
  } catch (err) {
    loadState.error = err?.message ?? t('surveyor.response.loadError');
  } finally {
    loadState.loading = false;
  }
};

const setFieldValue = (fieldId, value) => {
  answerState[fieldId] = value;
  if (fieldErrors[fieldId]) delete fieldErrors[fieldId];
};

const applyServerValidationDetails = (details) => {
  if (!Array.isArray(details)) return false;
  let mapped = false;
  for (const detail of details) {
    const path = Array.isArray(detail?.path) ? detail.path : [];
    if (path[0] === 'answers' && typeof path[1] === 'string') {
      fieldErrors[path[1]] = detail.message || t('publicForm.fieldErrors.required');
      mapped = true;
    }
  }
  return mapped;
};

const onSubmit = async () => {
  if (!schema.value) return;
  submitState.error = null;
  resetFieldErrors();

  const localErrors = validateAnswers(schema.value, answerState, t);
  if (Object.keys(localErrors).length > 0) {
    Object.assign(fieldErrors, localErrors);
    submitState.error = t('publicForm.validationSummary');
    return;
  }

  submitState.submitting = true;
  try {
    const result = await surveyorService.submitResponse(surveyId.value, {
      answers: serializeAnswers(schema.value, answerState),
      metadata: {
        startedAt: startedAt.value ? startedAt.value.toISOString() : undefined,
      },
    });
    submittedResult.value = result?.response ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.isValidation && applyServerValidationDetails(err.details)) {
      submitState.error = t('publicForm.validationSummary');
    } else {
      submitState.error = err?.message ?? t('surveyor.response.submitError');
    }
  } finally {
    submitState.submitting = false;
  }
};

onMounted(loadSurvey);
</script>

<template>
  <section class="surveyor-response">
    <AppLoader v-if="loadState.loading" />
    <AppAlert v-else-if="loadState.error" variant="error">{{ loadState.error }}</AppAlert>

    <PublicThankYouView
      v-else-if="submittedResult"
      :message="submittedResult.thankYouMessage || t('surveyor.response.thankYou')"
    />

    <AppCard v-else-if="survey" padded>
      <template #title>{{ survey.title }}</template>
      <p v-if="survey.description" class="surveyor-response__description">
        {{ survey.description }}
      </p>

      <AppAlert v-if="submitState.error" variant="error">
        {{ submitState.error }}
      </AppAlert>

      <form class="surveyor-response__form" novalidate @submit.prevent="onSubmit">
        <PublicFieldRenderer
          v-for="field in visibleFields"
          :key="field.id"
          :field="field"
          :model-value="answerState[field.id]"
          :error="fieldErrors[field.id]"
          @update:model-value="(value) => setFieldValue(field.id, value)"
        >
          <template #yes>{{ t('publicForm.yes') }}</template>
          <template #no>{{ t('publicForm.no') }}</template>
          <template #select-placeholder>{{ t('publicForm.selectPlaceholder') }}</template>
        </PublicFieldRenderer>

        <footer class="surveyor-response__footer">
          <AppButton type="button" variant="secondary" @click="router.back()">
            {{ t('common.cancel') }}
          </AppButton>
          <AppButton type="submit" :loading="submitState.submitting" :disabled="hasFieldErrors">
            {{
              submitState.submitting ? t('publicForm.submitting') : t('surveyor.response.submit')
            }}
          </AppButton>
        </footer>
      </form>
    </AppCard>
  </section>
</template>

<style scoped>
.surveyor-response {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.surveyor-response__description {
  margin: 0 0 var(--space-4) 0;
  color: var(--color-text-muted);
}

.surveyor-response__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.surveyor-response__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
