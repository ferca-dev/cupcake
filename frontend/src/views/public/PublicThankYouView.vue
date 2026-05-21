<script setup>
import { useI18n } from '../../i18n/index.js';

defineProps({
  message: { type: String, default: '' },
});

const { t } = useI18n();
</script>

<template>
  <section class="public-thank-you" role="status">
    <h1 class="public-thank-you__title">{{ t('publicForm.thanksTitle') }}</h1>
    <p class="public-thank-you__message">
      {{ message || t('publicForm.thanksDefault') }}
    </p>
  </section>
</template>

<style scoped>
.public-thank-you {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 0;
  text-align: center;
}

.public-thank-you__title {
  margin: 0;
  font-size: var(--font-size-xl);
  color: var(--color-text);
}

.public-thank-you__message {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
