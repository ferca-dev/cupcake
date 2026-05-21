<script setup>
import { reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { useAuthStore } from '../../stores/auth.store.js';
import { useI18n } from '../../i18n/index.js';
import { ApiError } from '../../services/apiClient.js';
import AppInput from '../../components/ui/AppInput.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppAlert from '../../components/ui/AppAlert.vue';

const auth = useAuthStore();
const { t } = useI18n();

const form = reactive({ email: '' });
const errors = reactive({ email: '' });
const formError = ref('');
const submitted = ref(false);
const isSubmitting = ref(false);

const validate = () => {
  errors.email = '';
  if (!form.email.trim()) {
    errors.email = t('validation.required');
    return false;
  }
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = t('validation.email');
    return false;
  }
  return true;
};

const onSubmit = async () => {
  formError.value = '';
  if (!validate()) return;
  isSubmitting.value = true;
  try {
    await auth.forgotPassword(form.email.trim());
    submitted.value = true;
  } catch (err) {
    if (err instanceof ApiError && err.isNetwork) {
      formError.value = t('auth.errors.networkError');
    } else {
      formError.value = err?.message || t('auth.errors.generic');
    }
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <article class="auth-view">
    <header>
      <h2>{{ t('auth.forgot.title') }}</h2>
      <p>{{ t('auth.forgot.subtitle') }}</p>
    </header>

    <AppAlert v-if="formError" variant="error" :title="t('common.error')">
      {{ formError }}
    </AppAlert>

    <AppAlert v-if="submitted" variant="success">
      {{ t('auth.forgot.successHint') }}
    </AppAlert>

    <form v-if="!submitted" class="auth-view__form" novalidate @submit.prevent="onSubmit">
      <AppInput
        id="forgot-email"
        v-model="form.email"
        type="email"
        autocomplete="email"
        :label="t('auth.forgot.emailLabel')"
        :error="errors.email"
        required
      />

      <AppButton type="submit" variant="primary" :loading="isSubmitting" full-width>
        {{ t('auth.forgot.submit') }}
      </AppButton>
    </form>

    <footer class="auth-view__links">
      <RouterLink :to="{ name: 'auth.login' }">{{ t('auth.forgot.backToLogin') }}</RouterLink>
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
}

.auth-view__links a {
  color: var(--color-primary-600);
  text-decoration: none;
}
</style>
