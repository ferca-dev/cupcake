<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAdminStore } from '../../stores/admin.store.js';
import { useI18n } from '../../i18n/index.js';
import { AppAlert, AppButton, AppCard, AppInput } from '../../components/ui/index.js';

const router = useRouter();
const store = useAdminStore();
const { t } = useI18n();

const form = reactive({
  name: '',
  slug: '',
  timezone: '',
  locale: '',
  withAdmin: true,
  adminName: '',
  adminEmail: '',
  adminPassword: '',
});

const error = ref('');
const isSubmitting = computed(() => store.isMutating);

const goBack = () => router.push({ name: 'admin.tenants.list' });

const buildPayload = () => {
  const payload = { name: form.name.trim() };
  if (form.slug.trim()) payload.slug = form.slug.trim();
  if (form.timezone.trim() || form.locale.trim()) {
    payload.settings = {};
    if (form.timezone.trim()) payload.settings.timezone = form.timezone.trim();
    if (form.locale.trim()) payload.settings.locale = form.locale.trim();
  }
  if (form.withAdmin) {
    payload.admin = {
      name: form.adminName.trim(),
      email: form.adminEmail.trim(),
      password: form.adminPassword,
    };
  }
  return payload;
};

const validate = () => {
  if (!form.name.trim()) {
    error.value = t('adminPanel.create.errors.nameRequired');
    return false;
  }
  if (form.withAdmin) {
    if (!form.adminName.trim() || !form.adminEmail.trim() || !form.adminPassword) {
      error.value = t('adminPanel.create.errors.adminFieldsRequired');
      return false;
    }
    if (form.adminPassword.length < 8) {
      error.value = t('adminPanel.create.errors.passwordTooShort');
      return false;
    }
  }
  error.value = '';
  return true;
};

const submit = async () => {
  if (!validate()) return;
  try {
    const tenant = await store.createTenant(buildPayload());
    if (tenant?.id) {
      router.push({ name: 'admin.tenants.detail', params: { id: tenant.id } });
    } else {
      goBack();
    }
  } catch (err) {
    error.value = err?.message ?? t('adminPanel.create.errors.createFailed');
  }
};
</script>

<template>
  <section class="tenant-create">
    <header class="tenant-create__header">
      <AppButton variant="ghost" size="sm" @click="goBack">
        {{ t('adminPanel.detail.backToList') }}
      </AppButton>
      <h2>{{ t('adminPanel.create.title') }}</h2>
      <p>{{ t('adminPanel.create.subtitle') }}</p>
    </header>

    <AppAlert v-if="error" variant="error">{{ error }}</AppAlert>

    <AppCard padded>
      <form class="tenant-create__form" @submit.prevent="submit">
        <AppInput v-model="form.name" :label="t('adminPanel.create.nameField')" required />
        <AppInput
          v-model="form.slug"
          :label="t('adminPanel.create.slugField')"
          :hint="t('adminPanel.create.slugHint')"
        />
        <div class="tenant-create__row">
          <AppInput
            v-model="form.timezone"
            :label="t('adminPanel.create.timezoneField')"
            placeholder="UTC"
          />
          <AppInput
            v-model="form.locale"
            :label="t('adminPanel.create.localeField')"
            placeholder="en-US"
          />
        </div>

        <label class="tenant-create__toggle">
          <input v-model="form.withAdmin" type="checkbox" />
          <span>{{ t('adminPanel.create.provisionAdmin') }}</span>
        </label>

        <template v-if="form.withAdmin">
          <AppInput v-model="form.adminName" :label="t('adminPanel.create.adminNameField')" />
          <AppInput
            v-model="form.adminEmail"
            type="email"
            autocomplete="off"
            :label="t('adminPanel.create.adminEmailField')"
          />
          <AppInput
            v-model="form.adminPassword"
            type="password"
            autocomplete="new-password"
            :label="t('adminPanel.create.adminPasswordField')"
          />
        </template>

        <div class="tenant-create__actions">
          <AppButton variant="ghost" type="button" :disabled="isSubmitting" @click="goBack">
            {{ t('adminPanel.create.cancel') }}
          </AppButton>
          <AppButton type="submit" :loading="isSubmitting">
            {{ t('adminPanel.create.submit') }}
          </AppButton>
        </div>
      </form>
    </AppCard>
  </section>
</template>

<style scoped>
.tenant-create {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 48rem;
}

.tenant-create__header h2 {
  margin: var(--space-2) 0 var(--space-1) 0;
}

.tenant-create__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.tenant-create__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tenant-create__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.tenant-create__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
}

.tenant-create__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 720px) {
  .tenant-create__row {
    grid-template-columns: 1fr;
  }
}
</style>
