<script setup>
import { useI18n } from '../../i18n/index.js';

defineProps({
  message: { type: String, default: '' },
});

const { t } = useI18n();
</script>

<template>
  <section class="public-thank-you" role="status">
    <span class="public-thank-you__icon" aria-hidden="true">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m5 12 4 4L19 6" />
      </svg>
    </span>
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
  padding: var(--space-8) var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  text-align: center;
}

.public-thank-you__icon {
  display: grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  margin-bottom: var(--space-3);
  border-radius: var(--radius-full);
  color: var(--color-success-700);
  background: var(--color-success-100);
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
