<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { useAdminStore } from '../../stores/admin.store.js';
import { useI18n } from '../../i18n/index.js';
import { APP_NAME } from '../../config/env.js';
import AdminDashboardPanel from '../../features/dashboard/AdminDashboard.vue';
import { AppAlert, AppButton, AppLoader } from '../../components/ui/index.js';

const router = useRouter();
const store = useAdminStore();
const { t } = useI18n();

const metrics = computed(() => store.metrics);
const isLoading = computed(() => store.isLoadingMetrics);
const error = computed(() => store.lastError);

const refresh = async () => {
  try {
    await store.fetchMetrics({ limit: 10 });
  } catch {
    // store.lastError surfaces the message via the alert below.
  }
};

const goToTenants = () => router.push({ name: 'admin.tenants.list' });

onMounted(refresh);
</script>

<template>
  <section class="admin-dashboard-view">
    <header class="admin-dashboard-view__header">
      <div>
        <h2>{{ t('adminPanel.overview.title') }}</h2>
        <p>{{ t('adminPanel.overview.subtitle', { appName: APP_NAME }) }}</p>
      </div>
      <div class="admin-dashboard-view__actions">
        <AppButton variant="secondary" :loading="isLoading" @click="refresh">
          {{ t('adminPanel.overview.refresh') }}
        </AppButton>
        <AppButton @click="goToTenants">
          {{ t('adminPanel.overview.manageTenants') }}
        </AppButton>
      </div>
    </header>

    <AppAlert v-if="error && !isLoading" variant="error">
      {{ t('adminPanel.overview.loadError') }}
    </AppAlert>

    <AppLoader v-if="isLoading && !metrics" />

    <AdminDashboardPanel v-else-if="metrics" :metrics="metrics" />
  </section>
</template>

<style scoped>
.admin-dashboard-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: var(--layout-content-max-width);
}

.admin-dashboard-view__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.admin-dashboard-view__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.admin-dashboard-view__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.admin-dashboard-view__actions {
  display: inline-flex;
  gap: var(--space-2);
}

@media (max-width: 720px) {
  .admin-dashboard-view__header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
