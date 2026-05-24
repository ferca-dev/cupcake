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
import { brandingService } from '../../services/branding.service.js';
import { domainService } from '../../services/domain.service.js';
import { mediaService } from '../../services/media.service.js';
import {
  AppAlert,
  AppBadge,
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
const brandingForm = reactive({
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#4f46e5',
  accentColor: '#e11d48',
  backgroundColor: '#f4f6fb',
  textColor: '#0f172a',
  publicFormTheme: 'light',
  whiteLabel: false,
});
const domainForm = reactive({
  hostname: '',
  sslMode: 'platform_managed',
});

const profileError = ref('');
const passwordError = ref('');
const preferencesError = ref('');
const brandingError = ref('');
const domainsError = ref('');
const profileSaved = ref(false);
const passwordSaved = ref(false);
const preferencesSaved = ref(false);
const brandingSaved = ref(false);
const brandingCapabilities = ref({
  customBranding: false,
  whiteLabel: false,
  customDomains: false,
});
const domains = ref([]);
const domainsLoading = ref(false);
const brandingLoading = ref(false);
const brandingSaving = ref(false);
const domainSaving = ref(false);

const localeOptions = computed(() =>
  supportedLocales.map((code) => ({
    value: code,
    label: t(`settings.preferences.languages.${code}`),
  })),
);
const themeOptions = computed(() => [
  { value: 'light', label: t('settings.branding.themes.light') },
  { value: 'dark', label: t('settings.branding.themes.dark') },
  { value: 'system', label: t('settings.branding.themes.system') },
]);
const sslModeOptions = computed(() => [
  { value: 'platform_managed', label: t('settings.domains.sslModes.platformManaged') },
  { value: 'manual', label: t('settings.domains.sslModes.manual') },
  { value: 'external', label: t('settings.domains.sslModes.external') },
]);

const hydrateForm = (profile) => {
  profileForm.name = profile?.name ?? '';
  profileForm.email = profile?.email ?? '';
  profileForm.phone = profile?.phone ?? '';
  profileForm.whatsappPhone = profile?.whatsappPhone ?? '';
  preferencesForm.locale = profile?.preferences?.locale ?? locale.value;
  preferencesForm.timezone = profile?.preferences?.timezone ?? 'UTC';
};

const hydrateBranding = (branding) => {
  brandingForm.logoUrl = branding?.logoUrl ?? '';
  brandingForm.faviconUrl = branding?.faviconUrl ?? '';
  brandingForm.primaryColor = branding?.primaryColor ?? '#4f46e5';
  brandingForm.accentColor = branding?.accentColor ?? '#e11d48';
  brandingForm.backgroundColor = branding?.backgroundColor ?? '#f4f6fb';
  brandingForm.textColor = branding?.textColor ?? '#0f172a';
  brandingForm.publicFormTheme = branding?.publicFormTheme ?? 'light';
  brandingForm.whiteLabel = Boolean(branding?.whiteLabel);
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

const loadBranding = async () => {
  brandingLoading.value = true;
  brandingError.value = '';
  try {
    const data = await brandingService.get();
    hydrateBranding(data?.branding ?? null);
    brandingCapabilities.value = data?.capabilities ?? brandingCapabilities.value;
  } catch (err) {
    brandingError.value = handleApiError(err, t('settings.branding.errors.loadFailed'));
  } finally {
    brandingLoading.value = false;
  }
};

const loadDomains = async () => {
  domainsLoading.value = true;
  domainsError.value = '';
  try {
    const data = await domainService.list();
    domains.value = data?.items ?? [];
  } catch (err) {
    domainsError.value = handleApiError(err, t('settings.domains.errors.loadFailed'));
  } finally {
    domainsLoading.value = false;
  }
};

const onLogoSelected = async (event) => {
  const file = event.target?.files?.[0];
  if (!file) return;
  brandingError.value = '';
  try {
    const data = await mediaService.uploadImage({ file, purpose: 'tenant_branding' });
    brandingForm.logoUrl = data?.asset?.url ?? data?.asset?.publicUrl ?? brandingForm.logoUrl;
  } catch (err) {
    brandingError.value = handleApiError(err, t('settings.branding.errors.uploadFailed'));
  } finally {
    event.target.value = '';
  }
};

const onBrandingSubmit = async () => {
  brandingError.value = '';
  brandingSaved.value = false;
  brandingSaving.value = true;
  try {
    const payload = {
      logoUrl: brandingForm.logoUrl.trim() || null,
      faviconUrl: brandingForm.faviconUrl.trim() || null,
      primaryColor: brandingForm.primaryColor,
      accentColor: brandingForm.accentColor,
      backgroundColor: brandingForm.backgroundColor,
      textColor: brandingForm.textColor,
      publicFormTheme: brandingForm.publicFormTheme,
      whiteLabel: brandingForm.whiteLabel,
    };
    const data = await brandingService.update(payload);
    hydrateBranding(data?.branding ?? null);
    brandingCapabilities.value = data?.capabilities ?? brandingCapabilities.value;
    brandingSaved.value = true;
  } catch (err) {
    brandingError.value = handleApiError(err, t('settings.branding.errors.saveFailed'));
  } finally {
    brandingSaving.value = false;
  }
};

const onDomainCreate = async () => {
  domainsError.value = '';
  domainSaving.value = true;
  try {
    await domainService.create({
      hostname: domainForm.hostname.trim(),
      sslMode: domainForm.sslMode,
    });
    domainForm.hostname = '';
    await loadDomains();
  } catch (err) {
    domainsError.value = handleApiError(err, t('settings.domains.errors.saveFailed'));
  } finally {
    domainSaving.value = false;
  }
};

const updateDomain = async (domain, action) => {
  domainsError.value = '';
  try {
    if (action === 'verify') await domainService.verify(domain.id);
    if (action === 'activate') await domainService.updateStatus(domain.id, 'active');
    if (action === 'deactivate') await domainService.updateStatus(domain.id, 'inactive');
    if (action === 'delete') await domainService.delete(domain.id);
    await loadDomains();
  } catch (err) {
    domainsError.value = handleApiError(err, t('settings.domains.errors.actionFailed'));
  }
};

const domainStatusVariant = (status) => {
  if (status === 'active') return 'success';
  if (status === 'verified') return 'info';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'neutral';
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
    await Promise.all([loadBranding(), loadDomains()]);
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

      <AppCard>
        <h2 class="settings-view__section-title">
          {{ t('settings.sections.branding') }}
        </h2>
        <AppLoader v-if="brandingLoading" />
        <form v-else class="settings-view__form" novalidate @submit.prevent="onBrandingSubmit">
          <AppAlert v-if="!brandingCapabilities.customBranding" variant="warning">
            {{ t('settings.branding.planBlocked') }}
          </AppAlert>

          <div class="settings-view__upload-row">
            <AppInput v-model="brandingForm.logoUrl" :label="t('settings.branding.logoUrl')" />
            <label class="settings-view__file-button">
              <span>{{ t('settings.branding.uploadLogo') }}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" @change="onLogoSelected" />
            </label>
          </div>

          <AppInput v-model="brandingForm.faviconUrl" :label="t('settings.branding.faviconUrl')" />

          <div class="settings-view__color-grid">
            <AppInput
              v-model="brandingForm.primaryColor"
              type="color"
              :label="t('settings.branding.primaryColor')"
            />
            <AppInput
              v-model="brandingForm.accentColor"
              type="color"
              :label="t('settings.branding.accentColor')"
            />
            <AppInput
              v-model="brandingForm.backgroundColor"
              type="color"
              :label="t('settings.branding.backgroundColor')"
            />
            <AppInput
              v-model="brandingForm.textColor"
              type="color"
              :label="t('settings.branding.textColor')"
            />
          </div>

          <AppSelect
            v-model="brandingForm.publicFormTheme"
            :label="t('settings.branding.theme')"
            :options="themeOptions"
          />

          <label class="settings-view__checkbox">
            <input
              v-model="brandingForm.whiteLabel"
              type="checkbox"
              :disabled="!brandingCapabilities.whiteLabel"
            />
            <span>{{ t('settings.branding.whiteLabel') }}</span>
          </label>

          <AppAlert v-if="brandingError" variant="error">{{ brandingError }}</AppAlert>
          <AppAlert v-else-if="brandingSaved" variant="success">
            {{ t('settings.branding.successHint') }}
          </AppAlert>
          <div class="settings-view__actions">
            <AppButton
              type="submit"
              variant="primary"
              :loading="brandingSaving"
              :disabled="!brandingCapabilities.customBranding"
            >
              {{ t('settings.branding.save') }}
            </AppButton>
          </div>
        </form>
      </AppCard>

      <AppCard>
        <h2 class="settings-view__section-title">
          {{ t('settings.sections.domains') }}
        </h2>
        <form class="settings-view__form" novalidate @submit.prevent="onDomainCreate">
          <AppAlert v-if="!brandingCapabilities.customDomains" variant="warning">
            {{ t('settings.domains.planBlocked') }}
          </AppAlert>
          <AppInput
            v-model="domainForm.hostname"
            :label="t('settings.domains.hostname')"
            placeholder="forms.example.com"
          />
          <AppSelect
            v-model="domainForm.sslMode"
            :label="t('settings.domains.sslMode')"
            :options="sslModeOptions"
          />
          <div class="settings-view__actions">
            <AppButton
              type="submit"
              variant="primary"
              :loading="domainSaving"
              :disabled="!brandingCapabilities.customDomains"
            >
              {{ t('settings.domains.add') }}
            </AppButton>
          </div>
        </form>

        <AppLoader v-if="domainsLoading" />
        <div v-else class="settings-view__domains">
          <p v-if="domains.length === 0" class="settings-view__empty">
            {{ t('settings.domains.empty') }}
          </p>
          <div v-for="domain in domains" :key="domain.id" class="settings-view__domain">
            <div>
              <div class="settings-view__domain-heading">
                <strong>{{ domain.hostname }}</strong>
                <AppBadge :variant="domainStatusVariant(domain.status)">
                  {{ t(`settings.domains.statuses.${domain.status}`) }}
                </AppBadge>
              </div>
              <code>{{ domain.dnsRecord.type }} {{ domain.dnsRecord.name }}</code>
              <code>{{ domain.dnsRecord.value }}</code>
            </div>
            <div class="settings-view__domain-actions">
              <AppButton type="button" variant="secondary" size="sm" @click="updateDomain(domain, 'verify')">
                {{ t('settings.domains.verify') }}
              </AppButton>
              <AppButton
                v-if="domain.status !== 'active'"
                type="button"
                variant="secondary"
                size="sm"
                @click="updateDomain(domain, 'activate')"
              >
                {{ t('settings.domains.activate') }}
              </AppButton>
              <AppButton
                v-else
                type="button"
                variant="secondary"
                size="sm"
                @click="updateDomain(domain, 'deactivate')"
              >
                {{ t('settings.domains.deactivate') }}
              </AppButton>
              <AppButton type="button" variant="danger" size="sm" @click="updateDomain(domain, 'delete')">
                {{ t('settings.domains.delete') }}
              </AppButton>
            </div>
          </div>
        </div>
        <AppAlert v-if="domainsError" variant="error">{{ domainsError }}</AppAlert>
      </AppCard>
    </div>
  </section>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
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

.settings-view__upload-row,
.settings-view__color-grid {
  display: grid;
  gap: var(--space-3);
}

.settings-view__file-button {
  align-self: end;
  display: inline-flex;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.55rem 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.settings-view__file-button input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.settings-view__checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
}

.settings-view__domains {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.settings-view__empty {
  color: var(--color-text-muted);
  margin: 0;
}

.settings-view__domain {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-border);
}

.settings-view__domain-heading,
.settings-view__domain-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  align-items: center;
}

.settings-view__domain code {
  display: block;
  overflow-wrap: anywhere;
  color: var(--color-text-muted);
}

@media (min-width: 960px) {
  .settings-view__panels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-view__upload-row,
  .settings-view__color-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
