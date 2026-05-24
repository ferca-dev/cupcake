<script setup>
// Survey-level settings panel. Phase 31 introduced anti-abuse controls
// (CAPTCHA, honeypot, fill-time floor, suspicious-action mode); the rest of
// the survey settings (response limit, anonymous, collectIp) live alongside
// them in the same store so an admin can review the public-form behavior in
// one place.
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useI18n } from '../../i18n/index.js';
import { surveyService } from '../../services/survey.service.js';
import { AppAlert, AppButton, AppCard, AppLoader, AppSelect } from '../../components/ui/index.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const surveyId = computed(() => route.params.id);

const loadState = reactive({ loading: true, error: null });
const saveState = reactive({ saving: false, error: null, savedAt: null });
const survey = ref(null);

const form = reactive({
  captchaRequired: false,
  honeypotEnabled: true,
  minFillSeconds: 0,
  perIpPerMinute: null,
  perTokenPerMinute: null,
  suspiciousAction: 'reject',
  locationMode: 'optional',
  locationMinAccuracy: 100,
  locationAllowIpFallback: true,
  locationStoreRawIp: false,
  locationRequiredMessage: 'Location is required to submit this survey.',
});

const suspiciousActionOptions = computed(() => [
  { value: 'reject', label: t('surveys.settings.antiAbuse.actions.reject') },
  { value: 'flag', label: t('surveys.settings.antiAbuse.actions.flag') },
]);

const locationModeOptions = computed(() => [
  { value: 'disabled', label: t('surveys.settings.locationCapture.modes.disabled', 'Disabled') },
  { value: 'optional', label: t('surveys.settings.locationCapture.modes.optional', 'Optional') },
  {
    value: 'required',
    label: t('surveys.settings.locationCapture.modes.required', 'Required for everyone'),
  },
  {
    value: 'required_for_surveyors',
    label: t(
      'surveys.settings.locationCapture.modes.required_for_surveyors',
      'Required for surveyors only',
    ),
  },
]);

const hydrate = (record) => {
  const antiAbuse = record?.settings?.antiAbuse ?? {};
  form.captchaRequired = Boolean(antiAbuse.captchaRequired);
  form.honeypotEnabled = antiAbuse.honeypotEnabled !== false;
  form.minFillSeconds = typeof antiAbuse.minFillSeconds === 'number' ? antiAbuse.minFillSeconds : 0;
  form.perIpPerMinute =
    typeof antiAbuse.perIpPerMinute === 'number' ? antiAbuse.perIpPerMinute : null;
  form.perTokenPerMinute =
    typeof antiAbuse.perTokenPerMinute === 'number' ? antiAbuse.perTokenPerMinute : null;
  form.suspiciousAction = antiAbuse.suspiciousAction === 'flag' ? 'flag' : 'reject';

  const loc = record?.settings?.locationCapture ?? {};
  form.locationMode = loc.mode ?? 'optional';
  form.locationMinAccuracy =
    typeof loc.minimumAccuracyMeters === 'number' ? loc.minimumAccuracyMeters : 100;
  form.locationAllowIpFallback = loc.allowIpFallback !== false;
  form.locationStoreRawIp = Boolean(loc.storeRawIp);
  form.locationRequiredMessage =
    loc.requiredMessage ?? 'Location is required to submit this survey.';
};

const loadSurvey = async () => {
  loadState.loading = true;
  loadState.error = null;
  try {
    const data = await surveyService.get(surveyId.value);
    survey.value = data?.survey ?? null;
    hydrate(survey.value);
  } catch (err) {
    loadState.error = err?.message ?? t('surveys.settings.loadError');
  } finally {
    loadState.loading = false;
  }
};

const normaliseNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
};

const onSave = async () => {
  saveState.saving = true;
  saveState.error = null;
  try {
    const payload = {
      settings: {
        antiAbuse: {
          captchaRequired: Boolean(form.captchaRequired),
          honeypotEnabled: Boolean(form.honeypotEnabled),
          minFillSeconds: normaliseNumber(form.minFillSeconds) ?? 0,
          perIpPerMinute: normaliseNumber(form.perIpPerMinute),
          perTokenPerMinute: normaliseNumber(form.perTokenPerMinute),
          suspiciousAction: form.suspiciousAction === 'flag' ? 'flag' : 'reject',
        },
        locationCapture: {
          mode: form.locationMode,
          minimumAccuracyMeters: normaliseNumber(form.locationMinAccuracy) ?? 100,
          allowIpFallback: Boolean(form.locationAllowIpFallback),
          storeRawIp: Boolean(form.locationStoreRawIp),
          requiredMessage: form.locationRequiredMessage,
        },
      },
    };
    const data = await surveyService.update(surveyId.value, payload);
    survey.value = data?.survey ?? null;
    hydrate(survey.value);
    saveState.savedAt = new Date();
  } catch (err) {
    saveState.error = err?.message ?? t('surveys.settings.saveError');
  } finally {
    saveState.saving = false;
  }
};

const goBack = () => router.push({ name: 'surveys.builder', params: { id: surveyId.value } });

onMounted(loadSurvey);

watch(surveyId, (next, prev) => {
  if (!next || next === prev) return;
  loadSurvey();
});
</script>

<template>
  <section class="survey-settings">
    <header class="survey-settings__header">
      <AppButton variant="ghost" size="sm" @click="goBack">
        ← {{ t('surveys.settings.back') }}
      </AppButton>
      <h2>{{ t('surveys.settings.title', { title: survey?.title ?? '' }) }}</h2>
    </header>

    <AppLoader v-if="loadState.loading" />
    <AppAlert v-else-if="loadState.error" variant="error">{{ loadState.error }}</AppAlert>

    <AppCard v-else padded>
      <template #title>{{ t('surveys.settings.antiAbuse.title') }}</template>
      <p class="survey-settings__hint">{{ t('surveys.settings.antiAbuse.subtitle') }}</p>

      <AppAlert v-if="saveState.error" variant="error">{{ saveState.error }}</AppAlert>
      <AppAlert v-else-if="saveState.savedAt" variant="success">
        {{ t('surveys.settings.savedAt', { time: saveState.savedAt.toLocaleTimeString() }) }}
      </AppAlert>

      <form class="survey-settings__form" @submit.prevent="onSave">
        <label class="survey-settings__row">
          <input v-model="form.captchaRequired" type="checkbox" />
          <span>
            <strong>{{ t('surveys.settings.antiAbuse.captcha.label') }}</strong>
            <small>{{ t('surveys.settings.antiAbuse.captcha.hint') }}</small>
          </span>
        </label>

        <label class="survey-settings__row">
          <input v-model="form.honeypotEnabled" type="checkbox" />
          <span>
            <strong>{{ t('surveys.settings.antiAbuse.honeypot.label') }}</strong>
            <small>{{ t('surveys.settings.antiAbuse.honeypot.hint') }}</small>
          </span>
        </label>

        <label class="survey-settings__field">
          <span>{{ t('surveys.settings.antiAbuse.minFill.label') }}</span>
          <input v-model.number="form.minFillSeconds" type="number" min="0" max="600" step="1" />
          <small>{{ t('surveys.settings.antiAbuse.minFill.hint') }}</small>
        </label>

        <label class="survey-settings__field">
          <span>{{ t('surveys.settings.antiAbuse.perIp.label') }}</span>
          <input v-model.number="form.perIpPerMinute" type="number" min="0" step="1" />
          <small>{{ t('surveys.settings.antiAbuse.perIp.hint') }}</small>
        </label>

        <label class="survey-settings__field">
          <span>{{ t('surveys.settings.antiAbuse.perToken.label') }}</span>
          <input v-model.number="form.perTokenPerMinute" type="number" min="0" step="1" />
          <small>{{ t('surveys.settings.antiAbuse.perToken.hint') }}</small>
        </label>

        <label class="survey-settings__field">
          <span>{{ t('surveys.settings.antiAbuse.action.label') }}</span>
          <AppSelect v-model="form.suspiciousAction" :options="suspiciousActionOptions" />
          <small>{{ t('surveys.settings.antiAbuse.action.hint') }}</small>
        </label>

        <footer class="survey-settings__footer">
          <AppButton type="submit" variant="primary" :loading="saveState.saving">
            {{ t('surveys.settings.save') }}
          </AppButton>
        </footer>
      </form>
    </AppCard>

    <AppCard v-if="!loadState.loading && !loadState.error" padded>
      <template #title>{{
        t('surveys.settings.locationCapture.title', 'Location Capture')
      }}</template>
      <p class="survey-settings__hint">
        {{
          t(
            'surveys.settings.locationCapture.subtitle',
            'Configure how geolocation and IP addresses are recorded.',
          )
        }}
      </p>

      <form class="survey-settings__form" @submit.prevent="onSave">
        <label class="survey-settings__field">
          <span>{{ t('surveys.settings.locationCapture.mode.label', 'Capture Mode') }}</span>
          <AppSelect v-model="form.locationMode" :options="locationModeOptions" />
        </label>

        <label v-if="form.locationMode !== 'disabled'" class="survey-settings__field">
          <span>{{
            t('surveys.settings.locationCapture.minAccuracy.label', 'Minimum Accuracy (meters)')
          }}</span>
          <input v-model.number="form.locationMinAccuracy" type="number" min="1" step="1" />
        </label>

        <label v-if="form.locationMode === 'required'" class="survey-settings__field">
          <span>{{
            t('surveys.settings.locationCapture.requiredMessage.label', 'Required Message')
          }}</span>
          <input v-model="form.locationRequiredMessage" type="text" />
        </label>

        <label class="survey-settings__row">
          <input v-model="form.locationAllowIpFallback" type="checkbox" />
          <span>
            <strong>{{
              t('surveys.settings.locationCapture.ipFallback.label', 'Allow IP Fallback')
            }}</strong>
            <small>{{
              t(
                'surveys.settings.locationCapture.ipFallback.hint',
                'If geolocation is unavailable or denied, fallback to server IP location.',
              )
            }}</small>
          </span>
        </label>

        <label class="survey-settings__row">
          <input v-model="form.locationStoreRawIp" type="checkbox" />
          <span>
            <strong>{{
              t('surveys.settings.locationCapture.storeRawIp.label', 'Store Raw IP')
            }}</strong>
            <small>{{
              t(
                'surveys.settings.locationCapture.storeRawIp.hint',
                'Store the raw IP address in the response. If disabled, a hash is stored for limits.',
              )
            }}</small>
          </span>
        </label>

        <footer class="survey-settings__footer">
          <AppButton type="submit" variant="primary" :loading="saveState.saving">
            {{ t('surveys.settings.save') }}
          </AppButton>
        </footer>
      </form>
    </AppCard>
  </section>
</template>

<style scoped>
.survey-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.survey-settings__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.survey-settings__hint {
  margin: 0 0 var(--space-3) 0;
  color: var(--color-text-muted);
}

.survey-settings__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.survey-settings__row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.survey-settings__row input[type='checkbox'] {
  margin-top: 4px;
}

.survey-settings__row span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.survey-settings__row small,
.survey-settings__field small {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.survey-settings__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-width: 280px;
}

.survey-settings__field input[type='number'],
.survey-settings__field input[type='text'] {
  padding: var(--space-2);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.survey-settings__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-3);
}
</style>
