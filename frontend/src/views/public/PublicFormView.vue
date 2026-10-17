<script setup>
// Public form renderer. Loads the published schema by slug (or by
// submission token), renders the interactive form, validates client-side,
// posts the response, and switches to the thank-you state on success.
// Survey lookup happens through `publicFormService`, which talks to the
// unauthenticated `/api/v1/public/forms/*` endpoints — auth tokens are
// ignored by the backend for these routes.
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
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
import SurveyFormFields from '../../components/public-form/SurveyFormFields.vue';
import PublicCaptchaWidget from '../../components/public-form/PublicCaptchaWidget.vue';
import PublicThankYouView from './PublicThankYouView.vue';
import { AppAlert, AppButton, AppLoader } from '../../components/ui/index.js';

const route = useRoute();
const { t } = useI18n();

const slug = computed(() => String(route.params.slug ?? ''));
const submissionToken = computed(() =>
  typeof route.params.submissionToken === 'string' ? route.params.submissionToken : null,
);

const surveyData = ref(null);
const schema = computed(() => surveyData.value?.version?.schema ?? null);
const survey = computed(() => surveyData.value?.survey ?? null);
const branding = computed(() => surveyData.value?.branding ?? null);
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
const honeypotFieldName = computed(() => antiAbuse.value?.honeypot?.fieldName ?? 'website_url');

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

const fieldList = ref(null);

const brandingStyle = computed(() => {
  const brand = branding.value;
  if (!brand) return {};
  return {
    '--public-brand-primary': brand.primaryColor || 'var(--color-primary-600)',
    '--public-brand-accent': brand.accentColor || 'var(--color-secondary-600)',
    '--public-brand-background': brand.backgroundColor || 'var(--color-surface-muted)',
    '--public-brand-text': brand.textColor || 'var(--color-text)',
  };
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
  if (submitState.error === t('publicForm.validationSummary')) submitState.error = null;
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
  if (!schema.value || submitState.submitting || !acceptingResponses.value) return;
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
    fieldList.value?.focusFirstError();
    return;
  }

  submitState.submitting = true;

  const locationCapture = survey.value?.settings?.locationCapture || {};
  const locMode = locationCapture.mode || 'optional';
  let locationMetadata = null;

  if (locMode === 'required' || locMode === 'optional') {
    locationMetadata = await new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ permissionStatus: 'unavailable', source: 'browser' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            permissionStatus: 'granted',
            source: 'browser',
            capturedAt: new Date(pos.timestamp).toISOString(),
          });
        },
        (err) => {
          resolve({
            permissionStatus: err.code === 1 ? 'denied' : 'unavailable',
            source: 'browser',
          });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });

    if (locMode === 'required') {
      const hasCoords = typeof locationMetadata.latitude === 'number';
      const minAccuracy = locationCapture.minimumAccuracyMeters || 100;
      if (
        (!hasCoords && !locationCapture.allowIpFallback) ||
        (hasCoords && locationMetadata.accuracyMeters > minAccuracy)
      ) {
        submitState.error =
          locationCapture.requiredMessage ||
          t('publicForm.locationRequired', 'Location is required to submit this survey.');
        submitState.submitting = false;
        return;
      }
    }
  }

  try {
    const payload = {
      answers: serializeAnswers(schema.value, answerState),
      metadata: {
        startedAt: startedAt.value ? startedAt.value.toISOString() : undefined,
      },
    };
    if (locationMetadata) {
      payload.metadata.location = locationMetadata;
    }
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
        fieldList.value?.focusFirstError();
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

watch(
  branding,
  (next) => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('public-white-label', Boolean(next?.whiteLabel));
    document.body.style.setProperty(
      '--public-brand-page-background',
      next?.backgroundColor || 'var(--color-surface-muted)',
    );
    if (next?.faviconUrl) {
      let favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.setAttribute('rel', 'icon');
        document.head.appendChild(favicon);
      }
      favicon.setAttribute('href', next.faviconUrl);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (typeof document === 'undefined') return;
  document.body.classList.remove('public-white-label');
  document.body.style.removeProperty('--public-brand-page-background');
});
</script>

<template>
  <article class="public-form" :style="brandingStyle" :data-public-slug="slug">
    <div v-if="loadState.loading" class="public-form__state" role="status">
      <AppLoader />
      <p>{{ t('publicForm.loading') }}</p>
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
        <img v-if="branding?.logoUrl" class="public-form__logo" :src="branding.logoUrl" alt="" />
        <p class="public-form__eyebrow">{{ t('publicForm.surveyLabel') }}</p>
        <h1 class="public-form__title">{{ survey.title }}</h1>
        <p v-if="survey.description" class="public-form__description">{{ survey.description }}</p>
      </header>

      <AppAlert v-if="!acceptingResponses" variant="warning">
        {{ pausedMessage || t('publicForm.paused') }}
      </AppAlert>

      <AppAlert v-if="submitState.error" variant="error">
        {{ submitState.error }}
      </AppAlert>

      <form
        class="public-form__form"
        :aria-busy="submitState.submitting"
        novalidate
        @submit.prevent="onSubmit"
      >
        <SurveyFormFields
          ref="fieldList"
          :schema="schema"
          :answers="answerState"
          :errors="fieldErrors"
          :disabled="submitState.submitting || !acceptingResponses"
          @update:answer="setFieldValue"
        />

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

        <AppAlert v-if="captchaError" variant="error" data-testid="public-form-captcha-error">
          {{ t('publicForm.captchaError') }}
        </AppAlert>

        <footer class="public-form__footer">
          <p>{{ t('publicForm.submitHint') }}</p>
          <AppButton
            type="submit"
            variant="primary"
            size="lg"
            :loading="submitState.submitting"
            :disabled="!acceptingResponses"
          >
            {{
              submitState.submitting ? t('publicForm.submitting') : t('publicForm.submitAnswers')
            }}
          </AppButton>
        </footer>
      </form>
    </template>
  </article>
</template>

<style scoped>
.public-form {
  width: 100%;
  min-width: 0;
  color: var(--public-brand-text, var(--color-text));
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.public-form__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-muted);
}
.public-form__header {
  padding: var(--space-7) var(--space-6);
  border: 1px solid var(--color-border);
  border-top: 4px solid var(--public-brand-primary, var(--color-primary-600));
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  overflow-wrap: anywhere;
}
.public-form__eyebrow {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--public-brand-primary, var(--color-primary-600));
}
.public-form__title {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 1.875rem);
  line-height: 1.35;
  letter-spacing: -0.025em;
  color: var(--public-brand-text, var(--color-text));
}
.public-form__description {
  margin: var(--space-4) 0 0;
  max-width: 65ch;
  color: var(--color-text-muted);
  line-height: 1.7;
  white-space: pre-line;
}
.public-form__logo {
  max-height: 4rem;
  max-width: 12rem;
  object-fit: contain;
  margin-bottom: var(--space-5);
}
:global(body.public-white-label .public-form-layout__footer) {
  display: none;
}
.public-form :deep(.app-button--primary) {
  background: var(--public-brand-primary, var(--color-primary-600));
  border-color: var(--public-brand-primary, var(--color-primary-600));
}
.public-form__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.public-form__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.public-form__footer p {
  margin: 0;
  max-width: 32ch;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.public-form__footer :deep(button) {
  min-height: 3rem;
}
@media (max-width: 600px) {
  .public-form__header {
    padding: var(--space-5) var(--space-4);
  }
  .public-form__footer {
    flex-direction: column;
    align-items: stretch;
    padding: var(--space-5) var(--space-4);
  }
  .public-form__footer p {
    max-width: none;
  }
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
