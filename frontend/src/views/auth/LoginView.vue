<script setup>
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '../../stores/auth.store.js';
import { useI18n } from '../../i18n/index.js';
import { ApiError } from '../../services/apiClient.js';
import { APP_NAME } from '../../config/env.js';
import AppInput from '../../components/ui/AppInput.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppAlert from '../../components/ui/AppAlert.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const form = reactive({ email: '', password: '' });
const errors = reactive({ email: '', password: '' });
const formError = ref('');
const isSubmitting = ref(false);

const title = computed(() => t('auth.login.title', { appName: APP_NAME }));

const validate = () => {
  errors.email = '';
  errors.password = '';
  let valid = true;
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
  }
  return valid;
};

const onSubmit = async () => {
  formError.value = '';
  if (!validate()) return;
  isSubmitting.value = true;
  try {
    await auth.login({ email: form.email.trim(), password: form.password });
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null;
    router.replace(redirect && redirect.startsWith('/') ? redirect : { name: 'dashboard.home' });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.isAuth) {
        formError.value = t('auth.errors.invalidCredentials');
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
      <p>{{ t('auth.login.subtitle') }}</p>
    </header>

    <AppAlert v-if="formError" variant="error" :title="t('common.error')">
      {{ formError }}
    </AppAlert>

    <form class="auth-view__form" novalidate @submit.prevent="onSubmit">
      <AppInput
        id="login-email"
        v-model="form.email"
        type="email"
        autocomplete="email"
        :label="t('auth.login.emailLabel')"
        :error="errors.email"
        required
      />
      <AppInput
        id="login-password"
        v-model="form.password"
        type="password"
        autocomplete="current-password"
        :label="t('auth.login.passwordLabel')"
        :error="errors.password"
        required
      />

      <AppButton type="submit" variant="primary" :loading="isSubmitting" full-width>
        {{ t('auth.login.submit') }}
      </AppButton>
    </form>

    <footer class="auth-view__links">
      <RouterLink :to="{ name: 'auth.forgot' }">
        {{ t('auth.login.forgotCta') }}
      </RouterLink>
      <span>
        {{ t('auth.login.noAccount') }}
        <RouterLink :to="{ name: 'auth.register' }">{{ t('auth.login.registerCta') }}</RouterLink>
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

.auth-view__links a:hover {
  text-decoration: underline;
}
</style>
