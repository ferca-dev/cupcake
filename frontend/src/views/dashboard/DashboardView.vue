<script setup>
import { computed } from 'vue';

import { useAuthStore } from '../../stores/auth.store.js';
import { useI18n } from '../../i18n/index.js';
import AppCard from '../../components/ui/AppCard.vue';
import AppBadge from '../../components/ui/AppBadge.vue';

const auth = useAuthStore();
const { t } = useI18n();

const name = computed(() => auth.displayName || 'there');
const tenantName = computed(() => auth.tenant?.name ?? '—');
const roleLabel = computed(() => (auth.role ?? '').replace('_', ' '));
const permissions = computed(() => auth.permissions ?? []);
</script>

<template>
  <section class="dashboard-view">
    <header class="dashboard-view__header">
      <h2>{{ t('dashboard.welcome', { name }) }}</h2>
      <p>{{ t('dashboard.summary', { role: roleLabel, tenant: tenantName }) }}</p>
    </header>

    <AppCard>
      <template #title>Status</template>
      <p>{{ t('dashboard.placeholder') }}</p>
      <div class="dashboard-view__permissions">
        <AppBadge v-for="permission in permissions" :key="permission" variant="info">
          {{ permission }}
        </AppBadge>
      </div>
    </AppCard>
  </section>
</template>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 60rem;
}

.dashboard-view__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.dashboard-view__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.dashboard-view__permissions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
</style>
