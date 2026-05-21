<script setup>
import { RouterView } from 'vue-router';
import { computed } from 'vue';

import { useI18n } from '../i18n/index.js';
import { APP_NAME } from '../config/env.js';

const { t } = useI18n();
const year = computed(() => new Date().getFullYear());
</script>

<template>
  <div class="auth-layout">
    <main id="main" class="auth-layout__panel">
      <header class="auth-layout__brand">
        <span class="auth-layout__logo" aria-hidden="true">{{ APP_NAME.charAt(0) }}</span>
        <h1 class="auth-layout__title">{{ APP_NAME }}</h1>
        <p class="auth-layout__tagline">{{ t('app.tagline') }}</p>
      </header>

      <section class="auth-layout__content">
        <RouterView />
      </section>

      <footer class="auth-layout__footer">
        <small>&copy; {{ year }} {{ APP_NAME }}</small>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.auth-layout {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 20% 0%, var(--color-primary-100), transparent 55%),
    radial-gradient(circle at 80% 100%, var(--color-secondary-100), transparent 60%),
    var(--color-surface-muted);
  padding: var(--space-6);
}

.auth-layout__panel {
  width: min(100%, 28rem);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.auth-layout__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
}

.auth-layout__logo {
  width: 3rem;
  height: 3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-600);
  color: var(--color-on-primary);
  font-weight: 700;
  font-size: 1.5rem;
}

.auth-layout__title {
  font-size: 1.5rem;
  margin: 0;
}

.auth-layout__tagline {
  color: var(--color-text-muted);
  margin: 0;
  font-size: var(--font-size-sm);
}

.auth-layout__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.auth-layout__footer {
  text-align: center;
  color: var(--color-text-muted);
}

@media (max-width: 480px) {
  .auth-layout__panel {
    padding: var(--space-6);
  }
}
</style>
