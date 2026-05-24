<script setup>
// Public form renderer. Loads the published schema by slug (or by
// submission token), renders the interactive form, validates client-side,
// posts the response, and switches to the thank-you state on success.
// Survey lookup happens through `publicFormService`, which talks to the
// unauthenticated `/api/v1/public/forms/*` endpoints — auth tokens are
// ignored by the backend for these routes.
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useI18n } from '../../i18n/index.js';
import { publicFormService } from '../../services/survey.service.js';
import { ApiError } from '../../services/apiClient.js';
import {
  buildInitialAnswers,
  serializeAnswers,
  validateAnswers,
} from '../../features/public-form/answers.js';
import { getOrCreateDeviceKey } from '../../features/public-form/device-key.js';
import { computeFieldVisibility } from '../../features/logic/logic-engine.js';
import PublicFieldRenderer from '../../components/public-form/PublicFieldRenderer.vue';
import PublicCaptchaWidget from '../../components/public-form/PublicCaptchaWidget.vue';
import PublicThankYouView from './PublicThankYouView.vue';
import { AppAlert, AppButton } from '../../components/ui/index.js';

const route = useRoute();
const { t } = useI18n();

const slug = computed(() => String(route.params.slug ?? ''));
const submissionToken = computed(() =>
  typeof route.params.submissionToken === 'string' ? route.params.submissionToken : null,
);

const surveyData = ref(null);
const schema = computed(() => surveyData.value?.version?.schema ?? null);
const survey = computed(() => surveyData.value?.survey ?? null);
const acceptingResponses = computed(() => surveyData.value?.acceptingResponses === true);
const pausedMessage = computed(() => surveyData.value?.pausedMessage ?? null);
const responseLimit = computed(() => survey.value?.settings?.responseLimit ?? null);
const limitMode = computed(() => responseLimit.value?.mode ?? 'unlimited');
const requiresDeviceKey = computed(
  () => responseLimit.value?.deviceKeyRequired === true || limitMode.value === 'one_per_device',
);
const limitMessage = computed(() => responseLimit.value?.message || t('publicForm.responseLimit'));

// Anti-abuse configuration the backend exposes for this survey. The renderer
// uses it to decide whether to mount the CAPTCHA widget and which honeypot
// field name to embed. Defaults are intentionally permissive — surveys that
// have not opted into anti-abuse work exactly as before.
const antiAbuse = computed(() => survey.value?.settings?.antiAbuse ?? null);
const captchaProvider = computed(() => antiAbuse.value?.captcha?.provider ?? 'none');
const captchaRequired = computed(() => Boolean(antiAbuse.value?.captcha?.required));
const captchaSiteKey = computed(() => antiAbuse.value?.captcha?.siteKey ?? null);
const honeypotEnabled = computed(() => Boolean(antiAbuse.value?.honeypot?.enabled));
const honeypotFieldName = computed(
  () => antiAbuse.value?.honeypot?.fieldName ?? 'website_url',
);

const captchaToken = ref(null);
const captchaError = ref(false);
const honeypotValue = ref('');

const loadState = reactive({ loading: true, error: null });
const submitState = reactive({ submitting: false, error: null });
const submittedResult = ref(null);
const limitReached = ref(false);

const answerState = reactive({});
const fieldErrors = reactive({});
const startedAt = ref(null);

const hasFieldErrors = computed(() => Object.keys(fieldErrors).length > 0);

const visibilityMap = computed(() => {
  if (!schema.value) return new Map();
  return computeFieldVisibility(schema.value, answerState);
});

const isFieldVisible = (fieldId) => visibilityMap.value.get(fieldId) !== false;

const visibleFields = computed(() => {
  if (!schema.value) return [];
  return schema.value.fields.filter((field) => isFieldVisible(field.id));
});

const resetAnswerState = (next) => {
  for (const key of Object.keys(answerState)) delete answerState[key];
  Object.assign(answerState, next);
};

const resetFieldErrors = () => {
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
};

const loadForm = async () => {
  loadState.loading = true;
  loadState.error = null;
  try {
    const data = submissionToken.value
      ? await publicFormService.getByToken(slug.value, submissionToken.value)
      : await publicFormService.get(slug.value);
    surveyData.value = data;
    const initial = buildInitialAnswers(data?.version?.schema ?? null);
    resetAnswerState(initial);
    resetFieldErrors();
    startedAt.value = new Date();
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) loadState.error = t('publicForm.notFound');
      else if (err.isNetwork) loadState.error = t('auth.errors.networkError');
      else loadState.error = err.message || t('publicForm.loadError');
    } else {
      loadState.error = t('publicForm.loadError');
    }
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

const onCaptchaToken = (token) => {
  captchaToken.value = typeof token === 'string' && token.length > 0 ? token : null;
};
const onCaptchaError = () => {
  captchaToken.value = null;
  captchaError.value = true;
};

const onSubmit = async () => {
  if (!schema.value) return;
  submitState.error = null;
  resetFieldErrors();

  if (captchaRequired.value && !captchaToken.value) {
    submitState.error = t('publicForm.captchaPending');
    return;
  }

  const localErrors = validateAnswers(schema.value, answerState, t);
  if (Object.keys(localErrors).length > 0) {
    Object.assign(fieldErrors, localErrors);
    submitState.error = t('publicForm.validationSummary');
    return;
  }

  submitState.submitting = true;
  try {
    const payload = {
      answers: serializeAnswers(schema.value, answerState),
      metadata: {
        startedAt: startedAt.value ? startedAt.value.toISOString() : undefined,
      },
    };
    if (submissionToken.value) {
      payload.submissionToken = submissionToken.value;
    }
    if (requiresDeviceKey.value) {
      payload.deviceKey = getOrCreateDeviceKey(slug.value);
    }
    if (captchaRequired.value && captchaToken.value) {
      payload.captchaToken = captchaToken.value;
    }
    if (honeypotEnabled.value) {
      // The honeypot is sent unconditionally so the backend can verify the
      // field was wired client-side. Real browsers leave it empty.
      payload.honeypot = { [honeypotFieldName.value]: honeypotValue.value ?? '' };
    }
    const result = await publicFormService.submit(slug.value, payload);
    submittedResult.value = result?.response ?? null;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'RESPONSE_LIMIT_REACHED') {
        limitReached.value = true;
        submitState.error = err.message || limitMessage.value;
      } else if (err.isValidation && applyServerValidationDetails(err.details)) {
        submitState.error = t('publicForm.validationSummary');
      } else if (err.status === 409) {
        submitState.error = err.message || t('publicForm.closed');
      } else if (err.status === 404) {
        submitState.error = t('publicForm.notFound');
      } else if (err.isRateLimited) {
        submitState.error = err.message;
      } else if (err.isNetwork) {
        submitState.error = t('auth.errors.networkError');
      } else {
        submitState.error = err.message || t('publicForm.submitError');
      }
    } else {
      submitState.error = t('publicForm.submitError');
    }
  } finally {
    submitState.submitting = false;
  }
};

onMounted(loadForm);

watch(slug, (next, prev) => {
  if (!next || next === prev) return;
  submittedResult.value = null;
  loadForm();
});
</script>

<template>
  <article class="public-form" :data-public-slug="slug">
    <div v-if="loadState.loading" class="public-form__state" role="status">
      {{ t('publicForm.loading') }}
    </div>

    <div v-else-if="loadState.error" class="public-form__state">
      <AppAlert variant="error">{{ loadState.error }}</AppAlert>
    </div>

    <div v-else-if="limitReached" class="public-form__state" data-testid="public-form-limit">
      <AppAlert variant="warning">{{ limitMessage }}</AppAlert>
    </div>

    <PublicThankYouView
      v-else-if="submittedResult"
      :message="submittedResult.thankYouMessage || survey?.settings?.thankYouMessage"
    />

    <template v-else-if="survey">
      <header class="public-form__header">
        <h1 class="public-form__title">{{ survey.title }}</h1>
        <p v-if="survey.description" class="public-form__description">{{ survey.description }}</p>
      </header>

      <AppAlert v-if="!acceptingResponses" variant="warning">
        {{ pausedMessage || t('publicForm.paused') }}
      </AppAlert>

      <AppAlert v-if="submitState.error" variant="error">
        {{ submitState.error }}
      </AppAlert>

      <form class="public-form__form" novalidate @submit.prevent="onSubmit">
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

        <!--
          Honeypot input. `aria-hidden` plus `tabindex="-1"` keeps it off the
          tab order and out of the screen reader tree; the visually-hidden
          wrapper removes it from the layout without using `display: none`
          (which some bots detect and skip). The label survives for the rare
          assistive technology that walks the DOM regardless of aria — its
          copy explicitly tells human readers to leave the field blank.
        -->
        <div
          v-if="honeypotEnabled"
          class="public-form__honeypot"
          aria-hidden="true"
          data-testid="public-form-honeypot"
        >
          <label :for="`honeypot-${honeypotFieldName}`">
            {{ t('publicForm.honeypotLabel') }}
          </label>
          <input
            :id="`honeypot-${honeypotFieldName}`"
            v-model="honeypotValue"
            :name="honeypotFieldName"
            type="text"
            tabindex="-1"
            autocomplete="off"
          />
        </div>

        <PublicCaptchaWidget
          v-if="captchaRequired && captchaProvider === 'turnstile'"
          :provider="captchaProvider"
          :site-key="captchaSiteKey"
          data-testid="public-form-captcha"
          @token-change="onCaptchaToken"
          @error="onCaptchaError"
        >
          <template #loading>{{ t('publicForm.captchaLoading') }}</template>
          <template #error>{{ t('publicForm.captchaError') }}</template>
        </PublicCaptchaWidget>

        <AppAlert
          v-if="captchaError"
          variant="error"
          data-testid="public-form-captcha-error"
        >
          {{ t('publicForm.captchaError') }}
        </AppAlert>

        <footer class="public-form__footer">
          <AppButton
            type="submit"
            variant="primary"
            :loading="submitState.submitting"
            :disabled="!acceptingResponses || hasFieldErrors"
          >
            {{ submitState.submitting ? t('publicForm.submitting') : t('publicForm.submit') }}
          </AppButton>
        </footer>
      </form>
    </template>
  </article>
</template>

<style scoped>
.public-form {
  width: 100%;
  background: var(--color-surface);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.public-form__state {
  text-align: center;
  color: var(--color-text-muted);
}

.public-form__header h1 {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--font-size-xl);
  color: var(--color-text);
}

.public-form__description {
  margin: 0;
  color: var(--color-text-muted);
}

.public-form__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.public-form__footer {
  display: flex;
  justify-content: flex-end;
}

/*
 * Visually hide the honeypot without `display: none` (which some bots use as
 * a signal to skip the field). Keeping it focusable would defeat the trap,
 * so the input itself is also `tabindex="-1"` and `aria-hidden` on the
 * wrapper removes it from the accessibility tree.
 */
.public-form__honeypot {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
