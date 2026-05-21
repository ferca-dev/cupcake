<script setup>
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { useAuthStore } from '../../stores/auth.store.js';
import { useI18n } from '../../i18n/index.js';
import { ApiError } from '../../services/apiClient.js';
import { APP_NAME } from '../../config/env.js';
import AppInput from '../../components/ui/AppInput.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppAlert from '../../components/ui/AppAlert.vue';

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();

const form = reactive({ name: '', tenantName: '', email: '', password: '' });
const errors = reactive({ name: '', tenantName: '', email: '', password: '' });
const formError = ref('');
const fieldErrors = ref([]);
const isSubmitting = ref(false);

const title = computed(() => t('auth.register.title', { appName: APP_NAME }));

const validate = () => {
  errors.name = '';
  errors.tenantName = '';
  errors.email = '';
  errors.password = '';
  let valid = true;
  if (!form.name.trim()) {
    errors.name = t('validation.required');
    valid = false;
  }
  if (!form.tenantName.trim()) {
    errors.tenantName = t('validation.required');
    valid = false;
  }
  if (!form.email.trim()) {
    errors.email = t('validation.required');
    valid = false;
  } else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = t('validation.email');
    valid = false;
  }
  if (!form.password) {
    errors.password = t('validation.required');
    valid = false;
  } else if (form.password.length < 8) {
    errors.password = t('validation.minLength', { min: 8 });
    valid = false;
  }
  return valid;
};

const applyServerErrors = (details) => {
  if (!Array.isArray(details)) return;
  for (const detail of details) {
    const path = Array.isArray(detail.path) ? detail.path[0] : detail.path;
    if (path && path in errors) {
      errors[path] = detail.message || errors[path];
    }
  }
};

const onSubmit = async () => {
  formError.value = '';
  fieldErrors.value = [];
  if (!validate()) return;
  isSubmitting.value = true;
  try {
    await auth.register({
      name: form.name.trim(),
      tenantName: form.tenantName.trim(),
      email: form.email.trim(),
      password: form.password,
    });
    router.replace({ name: 'dashboard.home' });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.isValidation) {
        applyServerErrors(err.details);
        formError.value = err.message || t('auth.errors.generic');
      } else if (err.isNetwork) {
        formError.value = t('auth.errors.networkError');
      } else {
        formError.value = err.message || t('auth.errors.generic');
      }
    } else {
      formError.value = t('auth.errors.generic');
    }
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <article class="auth-view">
    <header>
      <h2>{{ title }}</h2>
      <p>{{ t('auth.register.subtitle') }}</p>
    </header>

    <AppAlert v-if="formError" variant="error" :title="t('common.error')">
      {{ formError }}
    </AppAlert>

    <form class="auth-view__form" novalidate @submit.prevent="onSubmit">
      <AppInput
        id="register-name"
        v-model="form.name"
        autocomplete="name"
        :label="t('auth.register.nameLabel')"
        :error="errors.name"
        required
      />
      <AppInput
        id="register-tenant"
        v-model="form.tenantName"
        autocomplete="organization"
        :label="t('auth.register.tenantNameLabel')"
        :error="errors.tenantName"
        required
      />
      <AppInput
        id="register-email"
        v-model="form.email"
        type="email"
        autocomplete="email"
        :label="t('auth.register.emailLabel')"
        :error="errors.email"
        required
      />
      <AppInput
        id="register-password"
        v-model="form.password"
        type="password"
        autocomplete="new-password"
        :label="t('auth.register.passwordLabel')"
        :hint="t('auth.register.passwordHint')"
        :error="errors.password"
        required
      />

      <AppButton type="submit" variant="primary" :loading="isSubmitting" full-width>
        {{ t('auth.register.submit') }}
      </AppButton>
    </form>

    <footer class="auth-view__links">
      <span>
        {{ t('auth.register.hasAccount') }}
        <RouterLink :to="{ name: 'auth.login' }">{{ t('auth.register.loginCta') }}</RouterLink>
      </span>
    </footer>
  </article>
</template>

<style scoped>
.auth-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.auth-view header h2 {
  margin: 0 0 var(--space-1) 0;
}

.auth-view header p {
  margin: 0;
  color: var(--color-text-muted);
}

.auth-view__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.auth-view__links {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  text-align: center;
  color: var(--color-text-muted);
}

.auth-view__links a {
  color: var(--color-primary-600);
  text-decoration: none;
}
</style>
