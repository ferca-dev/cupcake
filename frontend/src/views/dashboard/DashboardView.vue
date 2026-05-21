<script setup>
import { computed, onMounted } from 'vue';

import { useAuthStore } from '../../stores/auth.store.js';
import { useDashboardStore } from '../../stores/dashboard.store.js';
import { useI18n } from '../../i18n/index.js';
import { AppAlert, AppButton, AppLoader } from '../../components/ui/index.js';
import ClientDashboard from '../../features/dashboard/ClientDashboard.vue';
import AdminDashboard from '../../features/dashboard/AdminDashboard.vue';

const auth = useAuthStore();
const store = useDashboardStore();
const { t } = useI18n();

const name = computed(() => auth.displayName || 'there');
const tenantName = computed(() => auth.tenant?.name ?? '—');
const roleLabel = computed(() => (auth.role ?? '').replace('_', ' '));

const isGlobal = computed(() => store.scope === 'global');
const summary = computed(() => store.summary);
const activity = computed(() => store.recentActivity);

const refresh = async () => {
  try {
    await store.fetchSummary();
    await store.fetchRecentActivity({ limit: 20 });
  } catch {
    // store.lastError surfaces the message to the user via the alert below.
  }
};

onMounted(refresh);
</script>

<template>
  <section class="dashboard-view">
    <header class="dashboard-view__header">
      <h2>{{ t('dashboard.welcome', { name }) }}</h2>
      <p>{{ t('dashboard.summary', { role: roleLabel, tenant: tenantName }) }}</p>
    </header>

    <div v-if="store.lastError && !store.isLoadingSummary" class="dashboard-view__error">
      <AppAlert variant="error">{{ t('dashboard.client.loadError') }}</AppAlert>
      <AppButton variant="secondary" size="sm" @click="refresh">
        {{ t('dashboard.client.retry') }}
      </AppButton>
    </div>

    <AppLoader v-if="store.isLoadingSummary && !summary" />

    <AdminDashboard v-else-if="isGlobal" :metrics="summary" />
    <ClientDashboard v-else-if="summary" :summary="summary" :activity="activity" />
  </section>
</template>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 90rem;
}

.dashboard-view__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.dashboard-view__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.dashboard-view__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}
</style>
