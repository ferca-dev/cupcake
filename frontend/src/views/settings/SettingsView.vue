<script setup>
// Authenticated settings surface. Three sections — profile, password,
// preferences — each posts to its own endpoint and keeps the auth store in
// sync via the settings store. Locale changes update the runtime i18n helper
// inside the store so the UI re-renders immediately on save.
import { computed, onMounted, reactive, ref, watch } from 'vue';

import { useI18n } from '../../i18n/index.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useSettingsStore } from '../../stores/settings.store.js';
import { ApiError } from '../../services/apiClient.js';
import {
  AppAlert,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppSelect,
} from '../../components/ui/index.js';

const { t, locale, supportedLocales } = useI18n();
const auth = useAuthStore();
const settings = useSettingsStore();

const profileForm = reactive({
  name: '',
  email: '',
  phone: '',
  whatsappPhone: '',
});
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const preferencesForm = reactive({
  locale: locale.value,
  timezone: 'UTC',
});

const profileError = ref('');
const passwordError = ref('');
const preferencesError = ref('');
const profileSaved = ref(false);
const passwordSaved = ref(false);
const preferencesSaved = ref(false);

const localeOptions = computed(() =>
  supportedLocales.map((code) => ({
    value: code,
    label: t(`settings.preferences.languages.${code}`),
  })),
);

const hydrateForm = (profile) => {
  profileForm.name = profile?.name ?? '';
  profileForm.email = profile?.email ?? '';
  profileForm.phone = profile?.phone ?? '';
  profileForm.whatsappPhone = profile?.whatsappPhone ?? '';
  preferencesForm.locale = profile?.preferences?.locale ?? locale.value;
  preferencesForm.timezone = profile?.preferences?.timezone ?? 'UTC';
};

const handleApiError = (err, fallback) => {
  if (err instanceof ApiError) {
    return err.message || fallback;
  }
  return fallback;
};

const onProfileSubmit = async () => {
  profileError.value = '';
  profileSaved.value = false;
  try {
    await settings.updateProfile({
      name: profileForm.name.trim(),
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim() || null,
      whatsappPhone: profileForm.whatsappPhone.trim() || null,
    });
    hydrateForm(settings.profile);
    profileSaved.value = true;
  } catch (err) {
    profileError.value = handleApiError(err, t('settings.errors.generic'));
  }
};

const onPasswordSubmit = async () => {
  passwordError.value = '';
  passwordSaved.value = false;
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordError.value = t('settings.password.mismatch');
    return;
  }
  try {
    await settings.updatePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
    passwordSaved.value = true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      passwordError.value = t('settings.errors.invalidCurrentPassword');
    } else {
      passwordError.value = handleApiError(err, t('settings.errors.generic'));
    }
  }
};

const onPreferencesSubmit = async () => {
  preferencesError.value = '';
  preferencesSaved.value = false;
  try {
    await settings.updatePreferences({
      locale: preferencesForm.locale,
      timezone: preferencesForm.timezone.trim() || 'UTC',
    });
    preferencesSaved.value = true;
  } catch (err) {
    preferencesError.value = handleApiError(err, t('settings.errors.generic'));
  }
};

watch(
  () => settings.profile,
  (next) => {
    if (next) hydrateForm(next);
  },
);

onMounted(async () => {
  try {
    if (auth.user) {
      hydrateForm({
        name: auth.user.name,
        email: auth.user.email,
        phone: auth.user.phone,
        whatsappPhone: auth.user.whatsappPhone,
        preferences: auth.user.preferences,
      });
    }
    await settings.load();
  } catch (err) {
    profileError.value = handleApiError(err, t('settings.errors.generic'));
  }
});
</script>

<template>
  <section class="settings-view">
    <header class="settings-view__header">
      <h1 class="settings-view__title">{{ t('settings.title') }}</h1>
      <p class="settings-view__subtitle">{{ t('settings.subtitle') }}</p>
    </header>

    <AppLoader v-if="settings.isLoading && !settings.profile" />

    <div v-else class="settings-view__panels">
      <AppCard>
        <h2 class="settings-view__section-title">
          {{ t('settings.sections.profile') }}
        </h2>
        <form class="settings-view__form" novalidate @submit.prevent="onProfileSubmit">
          <AppInput
            v-model="profileForm.name"
            :label="t('settings.profile.nameLabel')"
            autocomplete="name"
            required
          />
          <AppInput
            v-model="profileForm.email"
            type="email"
            :label="t('settings.profile.emailLabel')"
            autocomplete="email"
            :hint="
              settings.profile?.pendingEmail
                ? t('settings.profile.pendingEmailNotice', {
                    email: settings.profile.pendingEmail,
                  })
                : ''
            "
            required
          />
          <AppInput
            v-model="profileForm.phone"
            type="tel"
            :label="t('settings.profile.phoneLabel')"
            autocomplete="tel"
          />
          <AppInput
            v-model="profileForm.whatsappPhone"
            type="tel"
            :label="t('settings.profile.whatsappLabel')"
            autocomplete="tel"
          />
          <AppAlert v-if="profileError" variant="error">{{ profileError }}</AppAlert>
          <AppAlert v-else-if="profileSaved" variant="success">
            {{ t('settings.profile.successHint') }}
          </AppAlert>
          <div class="settings-view__actions">
            <AppButton
              type="submit"
              variant="primary"
              :loading="settings.isSavingProfile"
              data-testid="profile-save"
            >
              {{ t('settings.profile.save') }}
            </AppButton>
          </div>
        </form>
      </AppCard>

      <AppCard>
        <h2 class="settings-view__section-title">
          {{ t('settings.sections.password') }}
        </h2>
        <form class="settings-view__form" novalidate @submit.prevent="onPasswordSubmit">
          <AppInput
            v-model="passwordForm.currentPassword"
            type="password"
            :label="t('settings.password.currentLabel')"
            autocomplete="current-password"
            required
          />
          <AppInput
            v-model="passwordForm.newPassword"
            type="password"
            :label="t('settings.password.newLabel')"
            autocomplete="new-password"
            required
          />
          <AppInput
            v-model="passwordForm.confirmPassword"
            type="password"
            :label="t('settings.password.confirmLabel')"
            autocomplete="new-password"
            required
          />
          <AppAlert v-if="passwordError" variant="error">{{ passwordError }}</AppAlert>
          <AppAlert v-else-if="passwordSaved" variant="success">
            {{ t('settings.password.successHint') }}
          </AppAlert>
          <div class="settings-view__actions">
            <AppButton
              type="submit"
              variant="primary"
              :loading="settings.isSavingPassword"
              data-testid="password-save"
            >
              {{ t('settings.password.save') }}
            </AppButton>
          </div>
        </form>
      </AppCard>

      <AppCard>
        <h2 class="settings-view__section-title">
          {{ t('settings.sections.preferences') }}
        </h2>
        <form class="settings-view__form" novalidate @submit.prevent="onPreferencesSubmit">
          <AppSelect
            v-model="preferencesForm.locale"
            :label="t('settings.preferences.languageLabel')"
            :options="localeOptions"
          />
          <AppInput
            v-model="preferencesForm.timezone"
            :label="t('settings.preferences.timezoneLabel')"
            placeholder="UTC"
          />
          <AppAlert v-if="preferencesError" variant="error">{{ preferencesError }}</AppAlert>
          <AppAlert v-else-if="preferencesSaved" variant="success">
            {{ t('settings.preferences.successHint') }}
          </AppAlert>
          <div class="settings-view__actions">
            <AppButton
              type="submit"
              variant="primary"
              :loading="settings.isSavingPreferences"
              data-testid="preferences-save"
            >
              {{ t('settings.preferences.save') }}
            </AppButton>
          </div>
        </form>
      </AppCard>
    </div>
  </section>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 80rem;
}

.settings-view__header h1 {
  margin: 0 0 var(--space-1) 0;
  font-size: var(--font-size-xl);
}

.settings-view__subtitle {
  margin: 0;
  color: var(--color-text-muted);
}

.settings-view__panels {
  display: grid;
  gap: var(--space-5);
}

.settings-view__section-title {
  margin: 0 0 var(--space-3) 0;
  font-size: var(--font-size-lg);
}

.settings-view__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 38rem;
}

.settings-view__actions {
  display: flex;
  justify-content: flex-end;
}

@media (min-width: 960px) {
  .settings-view__panels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
