<script setup>
import { RouterView } from 'vue-router';
import { computed } from 'vue';

import { APP_NAME } from '../config/env.js';
import { useI18n } from '../i18n/index.js';

const { t } = useI18n();
const year = computed(() => new Date().getFullYear());
</script>

<template>
  <div class="public-form-layout">
    <main id="main" class="public-form-layout__content">
      <div class="public-form-layout__shell app-page app-page--narrow">
        <RouterView />
      </div>
    </main>
    <footer class="public-form-layout__footer">
      <small>
        {{ t('app.poweredBy') }} <strong>{{ APP_NAME }}</strong> · &copy; {{ year }}
      </small>
    </footer>
  </div>
</template>

<style scoped>
.public-form-layout {
  --layout-narrow-max-width: 48rem;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--public-brand-page-background, var(--color-surface-muted));
}

.public-form-layout__content {
  flex: 1;
  padding: var(--space-8) var(--layout-page-padding-x-sm);
  display: flex;
  justify-content: center;
}

.public-form-layout__shell {
  display: flex;
  flex-direction: column;
}

.public-form-layout__footer {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
}

@media (max-width: 600px) {
  .public-form-layout__content {
    padding: var(--space-4) var(--space-3);
  }
}
</style>
