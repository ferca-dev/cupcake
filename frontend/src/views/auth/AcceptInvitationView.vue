<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';

import { useAuthStore } from '../../stores/auth.store.js';
import { useI18n } from '../../i18n/index.js';
import { teamService } from '../../services/team.service.js';
import { ApiError } from '../../services/apiClient.js';
import { APP_NAME } from '../../config/env.js';
import AppInput from '../../components/ui/AppInput.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppAlert from '../../components/ui/AppAlert.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

const form = reactive({ name: '', password: '', confirmPassword: '' });
const errors = reactive({ name: '', password: '', confirmPassword: '' });
const formError = ref('');
const isSubmitting = ref(false);
const success = ref(null);

const token = computed(() => {
  const raw = route.query.token;
  return Array.isArray(raw) ? raw[0] : raw ?? '';
});

const tokenMissing = computed(() => !token.value || token.value.length < 8);

const validate = () => {
  errors.name = '';
  errors.password = '';
  errors.confirmPassword = '';
  let valid = true;
  if (!form.password || form.password.length < 8) {
    errors.password = t('validation.password');
    valid = false;
  }
  if (form.password !== form.confirmPassword) {
    errors.confirmPassword = t('team.accept.passwordMismatch');
    valid = false;
  }
  return valid;
};

const submit = async () => {
  formError.value = '';
  if (!validate()) return;
  isSubmitting.value = true;
  try {
    const data = await teamService.acceptInvitation({
      token: token.value,
      name: form.name?.trim() || undefined,
      password: form.password,
    });
    success.value = data;
    // Auto-login the freshly accepted user so they land directly in the
    // workspace rather than having to retype credentials.
    try {
      await auth.login({ email: data.user.email, password: form.password });
      router.replace({ name: 'dashboard.home' });
    } catch {
      // If auto-login fails (rare), the success screen still gives them a
      // link to the login page.
    }
  } catch (err) {
    if (err instanceof ApiError) {
      formError.value = err.message || t('team.accept.failure');
    } else {
      formError.value = t('team.accept.failure');
    }
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(() => {
  if (auth.isAuthenticated) {
    // A signed-in user cannot accept an invitation through this device — the
    // backend would reject (email mismatch) anyway. We surface the rule so the
    // user knows what to do.
    formError.value = t('team.accept.signOutFirst');
  }
});
</script>

<template>
  <article class="auth-view">
    <header>
      <h2>{{ t('team.accept.title', { appName: APP_NAME }) }}</h2>
      <p>{{ t('team.accept.subtitle') }}</p>
    </header>

    <AppAlert v-if="tokenMissing" variant="error">
      {{ t('team.accept.missingToken') }}
    </AppAlert>

    <AppAlert v-else-if="success" variant="success">
      {{ t('team.accept.success', { email: success.user.email }) }}
      <RouterLink :to="{ name: 'auth.login' }">{{ t('team.accept.goToLogin') }}</RouterLink>
    </AppAlert>

    <AppAlert v-if="formError" variant="error">{{ formError }}</AppAlert>

    <form v-if="!tokenMissing && !success" class="auth-view__form" novalidate @submit.prevent="submit">
      <AppInput
        v-model="form.name"
        :label="t('team.accept.nameField')"
        :hint="t('team.accept.nameHint')"
        autocomplete="name"
      />
      <AppInput
        v-model="form.password"
        type="password"
        autocomplete="new-password"
        :label="t('team.accept.passwordField')"
        :error="errors.password"
        required
      />
      <AppInput
        v-model="form.confirmPassword"
        type="password"
        autocomplete="new-password"
        :label="t('team.accept.confirmPasswordField')"
        :error="errors.confirmPassword"
        required
      />
      <AppButton type="submit" variant="primary" :loading="isSubmitting" full-width>
        {{ t('team.accept.submit') }}
      </AppButton>
    </form>
  </article>
</template>
