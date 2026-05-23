<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { publicUnsubscribeService } from '../../services/suppression.service.js';
import { useI18n } from '../../i18n/index.js';
import { AppAlert, AppButton, AppCard, AppLoader } from '../../components/ui/index.js';

const route = useRoute();
const { t } = useI18n();

const isLoading = ref(true);
const isSubmitting = ref(false);
const error = ref('');
const preview = ref(null);
const confirmed = ref(false);

const token = computed(() => String(route.params.token ?? ''));
const email = computed(() => preview.value?.email ?? '');

onMounted(async () => {
  try {
    preview.value = await publicUnsubscribeService.previewEmail(token.value);
    confirmed.value = Boolean(preview.value?.alreadyUnsubscribed);
  } catch {
    error.value = t('unsubscribe.invalid');
  } finally {
    isLoading.value = false;
  }
});

const confirm = async () => {
  isSubmitting.value = true;
  error.value = '';
  try {
    const result = await publicUnsubscribeService.confirmEmail(token.value);
    preview.value = { ...preview.value, email: result?.email ?? email.value };
    confirmed.value = true;
  } catch {
    error.value = t('unsubscribe.invalid');
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <section class="unsubscribe">
    <AppLoader v-if="isLoading" :label="t('unsubscribe.loading')" />
    <AppCard v-else padded>
      <template #title>
        {{ confirmed ? t('unsubscribe.successTitle') : t('unsubscribe.title') }}
      </template>

      <AppAlert v-if="error" variant="error">{{ error }}</AppAlert>

      <template v-else>
        <p v-if="confirmed" class="unsubscribe__copy">
          {{
            preview?.alreadyUnsubscribed
              ? t('unsubscribe.already')
              : t('unsubscribe.successMessage', { email })
          }}
        </p>
        <template v-else>
          <p class="unsubscribe__copy">
            {{ t('unsubscribe.subtitle', { email }) }}
          </p>
          <AppButton :loading="isSubmitting" @click="confirm">
            {{ t('unsubscribe.confirm') }}
          </AppButton>
        </template>
      </template>
    </AppCard>
  </section>
</template>

<style scoped>
.unsubscribe {
  width: 100%;
}

.unsubscribe__copy {
  margin: 0 0 var(--space-4);
  color: var(--color-text-muted);
}
</style>
