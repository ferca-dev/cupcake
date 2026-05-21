<script setup>
import { RouterLink } from 'vue-router';
import { useI18n } from '../i18n/index.js';

const { t } = useI18n();
</script>

<template>
  <section class="status-view">
    <h1>404</h1>
    <h2>{{ t('notFound.title') }}</h2>
    <p>{{ t('notFound.subtitle') }}</p>
    <RouterLink :to="{ name: 'dashboard.home' }">{{ t('notFound.backHome') }}</RouterLink>
  </section>
</template>

<style scoped>
.status-view {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-6);
}

.status-view h1 {
  font-size: 3rem;
  margin: 0;
  color: var(--color-primary-700);
}

.status-view a {
  color: var(--color-primary-600);
}
</style>
