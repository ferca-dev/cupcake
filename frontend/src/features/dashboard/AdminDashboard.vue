<script setup>
import { computed } from 'vue';

import { AppCard, AppBadge, AppTable, AppAlert } from '../../components/ui/index.js';
import { useI18n } from '../../i18n/index.js';
import { APP_NAME } from '../../config/env.js';
import DashboardKpi from './DashboardKpi.vue';
import DashboardKpiGrid from './DashboardKpiGrid.vue';
import DashboardChannelsTable from './DashboardChannelsTable.vue';
import DashboardActivityList from './DashboardActivityList.vue';

const props = defineProps({
  metrics: { type: Object, default: null },
});

const { t } = useI18n();

const clients = computed(() => props.metrics?.clients ?? { total: 0, active: 0, inactive: 0 });
const users = computed(() => props.metrics?.users ?? { total: 0 });
const surveys = computed(() => props.metrics?.surveys ?? { total: 0, active: 0 });
const responses = computed(() => props.metrics?.responses ?? { total: 0 });
const campaigns = computed(() => props.metrics?.campaigns ?? { total: 0 });
const channels = computed(() => props.metrics?.channels ?? []);
const recentTenants = computed(() => props.metrics?.recentTenants ?? []);
const activity = computed(() => props.metrics?.recentActivity ?? []);

const tenantColumns = computed(() => [
  { key: 'name', label: t('dashboard.client.tables.title') },
  { key: 'slug', label: t('dashboard.client.tables.slug') },
  { key: 'status', label: t('dashboard.client.tables.status') },
  { key: 'createdAt', label: t('dashboard.client.tables.when'), align: 'right' },
]);

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const statusVariant = (status) => {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
};
</script>

<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <h2>{{ t('dashboard.admin.title') }}</h2>
      <p>{{ t('dashboard.admin.subtitle', { appName: APP_NAME }) }}</p>
    </header>

    <DashboardKpiGrid>
      <DashboardKpi
        :label="t('dashboard.admin.kpis.totalClients')"
        :value="clients.total"
        tone="primary"
      />
      <DashboardKpi
        :label="t('dashboard.admin.kpis.activeClients')"
        :value="clients.active"
        tone="success"
      />
      <DashboardKpi
        :label="t('dashboard.admin.kpis.inactiveClients')"
        :value="clients.inactive"
        tone="warning"
      />
      <DashboardKpi :label="t('dashboard.admin.kpis.totalUsers')" :value="users.total" />
      <DashboardKpi :label="t('dashboard.admin.kpis.totalSurveys')" :value="surveys.total" />
      <DashboardKpi
        :label="t('dashboard.admin.kpis.totalResponses')"
        :value="responses.total"
        tone="primary"
      />
      <DashboardKpi :label="t('dashboard.admin.kpis.totalCampaigns')" :value="campaigns.total" />
    </DashboardKpiGrid>

    <AppCard>
      <template #title>{{ t('dashboard.admin.channelsTitle') }}</template>
      <DashboardChannelsTable :channels="channels" :empty="t('dashboard.client.channelsEmpty')" />
    </AppCard>

    <div class="dashboard__grid">
      <AppCard>
        <template #title>{{ t('dashboard.admin.recentTenants') }}</template>
        <AppTable
          :columns="tenantColumns"
          :rows="recentTenants"
          row-key="id"
          :empty="t('dashboard.client.recentSurveysEmpty')"
        >
          <template #cell:status="{ row }">
            <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
          </template>
          <template #cell:createdAt="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </AppTable>
      </AppCard>

      <AppCard>
        <template #title>{{ t('dashboard.admin.recentTransactions') }}</template>
        <AppAlert variant="info">{{ t('dashboard.admin.transactionsPending') }}</AppAlert>
      </AppCard>

      <AppCard class="dashboard__activity">
        <template #title>{{ t('dashboard.admin.activityTitle') }}</template>
        <DashboardActivityList :items="activity" :empty="t('dashboard.client.activityEmpty')" />
      </AppCard>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.dashboard__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.dashboard__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  gap: var(--space-4);
}

.dashboard__activity {
  grid-column: 1 / -1;
}
</style>
