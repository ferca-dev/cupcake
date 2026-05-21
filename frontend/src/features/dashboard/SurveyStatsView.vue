<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useDashboardStore } from '../../stores/dashboard.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppLoader,
  AppTable,
} from '../../components/ui/index.js';
import DashboardKpi from './DashboardKpi.vue';
import DashboardKpiGrid from './DashboardKpiGrid.vue';
import DashboardChannelsTable from './DashboardChannelsTable.vue';

const route = useRoute();
const router = useRouter();
const store = useDashboardStore();
const { t } = useI18n();

const stats = computed(() => store.surveyStats);

const channelRows = computed(() => {
  const channels = stats.value?.channels ?? {};
  return ['email', 'sms', 'whatsapp'].map((channel) => ({
    channel,
    attempted: channels[channel]?.attempted ?? 0,
    sent: channels[channel]?.sent ?? 0,
    failed: channels[channel]?.failed ?? 0,
    skipped: channels[channel]?.skipped ?? 0,
    pending: 0,
  }));
});

const responsesByDayColumns = computed(() => [
  { key: 'date', label: t('dashboard.client.tables.submittedAt') },
  { key: 'count', label: t('dashboard.client.tables.responses'), align: 'right' },
]);

const latestResponseColumns = computed(() => [
  { key: 'submittedAt', label: t('dashboard.client.tables.submittedAt') },
  { key: 'completionTimeSeconds', label: t('dashboard.client.tables.time'), align: 'right' },
]);

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const formatSeconds = (seconds) => {
  if (seconds === null || seconds === undefined) return t('dashboard.surveyStats.noData');
  return t('dashboard.surveyStats.seconds', { value: seconds });
};

const formatRate = (rate) => {
  if (rate === null || rate === undefined) return t('dashboard.surveyStats.noData');
  return `${Math.round(rate * 100)}%`;
};

const statusVariant = (status) => {
  switch (status) {
    case 'published':
      return 'success';
    case 'paused':
      return 'warning';
    case 'archived':
      return 'neutral';
    default:
      return 'info';
  }
};

const fetchStats = async () => {
  if (!route.params.id) return;
  try {
    await store.fetchSurveyStats(String(route.params.id));
  } catch {
    // store.lastError is rendered below.
  }
};

onMounted(fetchStats);

watch(() => route.params.id, fetchStats);

const back = () => router.push({ name: 'dashboard.home' });
</script>

<template>
  <section class="survey-stats-view">
    <header class="survey-stats-view__header">
      <AppButton variant="ghost" size="sm" @click="back">← {{ t('common.back') }}</AppButton>
      <div v-if="stats" class="survey-stats-view__title">
        <h2>{{ stats.title }}</h2>
        <AppBadge :variant="statusVariant(stats.status)">{{ stats.status }}</AppBadge>
      </div>
    </header>

    <AppLoader v-if="store.isLoadingSurveyStats && !stats" />

    <AppAlert v-else-if="store.lastError && !stats" variant="error">
      {{ store.lastError }}
    </AppAlert>

    <template v-else-if="stats">
      <DashboardKpiGrid>
        <DashboardKpi
          :label="t('dashboard.surveyStats.totalResponses')"
          :value="stats.totalResponses"
          tone="primary"
        />
        <DashboardKpi
          :label="t('dashboard.surveyStats.completed')"
          :value="stats.completedResponses"
          tone="success"
        />
        <DashboardKpi :label="t('dashboard.surveyStats.totalSent')" :value="stats.totalSent" />
        <DashboardKpi
          :label="t('dashboard.surveyStats.responseRate')"
          :value="formatRate(stats.responseRate)"
        />
        <DashboardKpi
          :label="t('dashboard.surveyStats.avgCompletion')"
          :value="formatSeconds(stats.avgCompletionTimeSeconds)"
        />
        <DashboardKpi
          :label="t('dashboard.surveyStats.lastResponse')"
          :value="formatDate(stats.lastResponseAt) || t('dashboard.surveyStats.noData')"
        />
      </DashboardKpiGrid>

      <AppCard>
        <template #title>{{ t('dashboard.client.channelsTitle') }}</template>
        <DashboardChannelsTable
          :channels="channelRows"
          :empty="t('dashboard.client.channelsEmpty')"
        />
      </AppCard>

      <div class="survey-stats-view__grid">
        <AppCard>
          <template #title>{{ t('dashboard.client.tables.responses') }}</template>
          <AppTable
            :columns="responsesByDayColumns"
            :rows="stats.responsesByDay"
            row-key="date"
            :empty="t('dashboard.client.latestResponsesEmpty')"
          />
        </AppCard>

        <AppCard>
          <template #title>{{ t('dashboard.client.latestResponses') }}</template>
          <AppTable
            :columns="latestResponseColumns"
            :rows="stats.latestResponses"
            row-key="id"
            :empty="t('dashboard.client.latestResponsesEmpty')"
          >
            <template #cell:submittedAt="{ row }">{{ formatDate(row.submittedAt) }}</template>
            <template #cell:completionTimeSeconds="{ row }">
              {{ formatSeconds(row.completionTimeSeconds) }}
            </template>
          </AppTable>
        </AppCard>
      </div>
    </template>
  </section>
</template>

<style scoped>
.survey-stats-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 90rem;
}

.survey-stats-view__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.survey-stats-view__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.survey-stats-view__title h2 {
  margin: 0;
}

.survey-stats-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  gap: var(--space-4);
}
</style>
