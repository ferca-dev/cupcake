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
      <RouterView />
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
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface-muted);
}

.public-form-layout__content {
  flex: 1;
  padding: var(--space-6) var(--space-4);
  display: flex;
  justify-content: center;
}

.public-form-layout__footer {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-border);
}
</style>
