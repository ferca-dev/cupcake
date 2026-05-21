<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { AppCard, AppBadge, AppTable } from '../../components/ui/index.js';
import { useI18n } from '../../i18n/index.js';
import DashboardKpi from './DashboardKpi.vue';
import DashboardKpiGrid from './DashboardKpiGrid.vue';
import DashboardChannelsTable from './DashboardChannelsTable.vue';
import DashboardActivityList from './DashboardActivityList.vue';

const props = defineProps({
  summary: { type: Object, default: null },
  activity: { type: Array, default: () => [] },
});

const { t } = useI18n();

const surveys = computed(() => props.summary?.surveys ?? { total: 0, active: 0 });
const responses = computed(() => props.summary?.responses ?? { total: 0 });
const campaigns = computed(() => props.summary?.campaigns ?? { total: 0 });
const contacts = computed(() => props.summary?.contacts ?? { total: 0, groups: 0 });

const channelRows = computed(() => {
  const totals = props.summary?.channels?.totals ?? {};
  return ['email', 'sms', 'whatsapp'].map((channel) => ({
    channel,
    attempted: totals[channel]?.attempted ?? 0,
    sent: totals[channel]?.sent ?? 0,
    failed: totals[channel]?.failed ?? 0,
    skipped: totals[channel]?.skipped ?? 0,
    pending: totals[channel]?.pending ?? 0,
  }));
});

const recentSurveys = computed(() => props.summary?.recentSurveys ?? []);
const bestSurveys = computed(() => props.summary?.bestResponseSurveys ?? []);
const lowSurveys = computed(() => props.summary?.lowResponseSurveys ?? []);
const latestResponses = computed(() => props.summary?.latestResponses ?? []);

const surveyColumns = computed(() => [
  { key: 'title', label: t('dashboard.client.tables.title') },
  { key: 'status', label: t('dashboard.client.tables.status') },
  { key: 'totalResponses', label: t('dashboard.client.tables.responses'), align: 'right' },
  { key: 'sentCount', label: t('dashboard.client.tables.sent'), align: 'right' },
  { key: 'responseRate', label: t('dashboard.client.tables.rate'), align: 'right' },
]);

const recentSurveyColumns = computed(() => [
  { key: 'title', label: t('dashboard.client.tables.title') },
  { key: 'status', label: t('dashboard.client.tables.status') },
  { key: 'updatedAt', label: t('dashboard.client.tables.updated'), align: 'right' },
]);

const latestResponseColumns = computed(() => [
  { key: 'survey', label: t('dashboard.client.tables.title') },
  { key: 'submittedAt', label: t('dashboard.client.tables.submittedAt') },
  { key: 'time', label: t('dashboard.client.tables.time'), align: 'right' },
]);

const formatRate = (rate) => {
  if (rate === null || rate === undefined) return t('dashboard.client.noRate');
  return `${Math.round(rate * 100)}%`;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const formatSeconds = (seconds) => {
  if (seconds === null || seconds === undefined) return t('dashboard.client.noRate');
  return t('dashboard.surveyStats.seconds', { value: seconds });
};

const statusVariant = (status) => {
  switch (status) {
    case 'published':
      return 'success';
    case 'paused':
      return 'warning';
    case 'archived':
      return 'neutral';
    case 'draft':
      return 'info';
    default:
      return 'neutral';
  }
};
</script>

<template>
  <div class="dashboard">
    <DashboardKpiGrid>
      <DashboardKpi
        :label="t('dashboard.client.kpis.totalSurveys')"
        :value="surveys.total"
      />
      <DashboardKpi
        :label="t('dashboard.client.kpis.activeSurveys')"
        :value="surveys.active"
        tone="success"
      />
      <DashboardKpi
        :label="t('dashboard.client.kpis.totalResponses')"
        :value="responses.total"
        tone="primary"
      />
      <DashboardKpi
        :label="t('dashboard.client.kpis.totalCampaigns')"
        :value="campaigns.total"
      />
      <DashboardKpi
        :label="t('dashboard.client.kpis.totalContacts')"
        :value="contacts.total"
        :hint="contacts.groups ? `${contacts.groups} groups` : ''"
      />
    </DashboardKpiGrid>

    <AppCard>
      <template #title>{{ t('dashboard.client.channelsTitle') }}</template>
      <DashboardChannelsTable
        :channels="channelRows"
        :empty="t('dashboard.client.channelsEmpty')"
      />
    </AppCard>

    <div class="dashboard__grid">
      <AppCard>
        <template #title>{{ t('dashboard.client.recentSurveys') }}</template>
        <AppTable
          :columns="recentSurveyColumns"
          :rows="recentSurveys"
          row-key="id"
          :empty="t('dashboard.client.recentSurveysEmpty')"
        >
          <template #cell:title="{ row }">
            <RouterLink :to="{ name: 'surveys.stats', params: { id: row.id } }">
              {{ row.title }}
            </RouterLink>
          </template>
          <template #cell:status="{ row }">
            <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
          </template>
          <template #cell:updatedAt="{ row }">
            {{ formatDate(row.updatedAt) }}
          </template>
        </AppTable>
      </AppCard>

      <AppCard>
        <template #title>{{ t('dashboard.client.bestPerforming') }}</template>
        <AppTable
          :columns="surveyColumns"
          :rows="bestSurveys"
          row-key="id"
          :empty="t('dashboard.client.recentSurveysEmpty')"
        >
          <template #cell:status="{ row }">
            <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
          </template>
          <template #cell:responseRate="{ row }">
            {{ formatRate(row.responseRate) }}
          </template>
        </AppTable>
      </AppCard>

      <AppCard>
        <template #title>{{ t('dashboard.client.lowPerforming') }}</template>
        <AppTable
          :columns="surveyColumns"
          :rows="lowSurveys"
          row-key="id"
          :empty="t('dashboard.client.recentSurveysEmpty')"
        >
          <template #cell:status="{ row }">
            <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
          </template>
          <template #cell:responseRate="{ row }">
            {{ formatRate(row.responseRate) }}
          </template>
        </AppTable>
      </AppCard>

      <AppCard>
        <template #title>{{ t('dashboard.client.latestResponses') }}</template>
        <AppTable
          :columns="latestResponseColumns"
          :rows="latestResponses"
          row-key="id"
          :empty="t('dashboard.client.latestResponsesEmpty')"
        >
          <template #cell:survey="{ row }">
            <span v-if="row.survey?.title">{{ row.survey.title }}</span>
            <span v-else>—</span>
          </template>
          <template #cell:submittedAt="{ row }">
            {{ formatDate(row.submittedAt) }}
          </template>
          <template #cell:time="{ row }">
            {{ formatSeconds(row.completionTimeSeconds) }}
          </template>
        </AppTable>
      </AppCard>

      <AppCard class="dashboard__activity">
        <template #title>{{ t('dashboard.client.activityTitle') }}</template>
        <DashboardActivityList
          :items="activity"
          :empty="t('dashboard.client.activityEmpty')"
        />
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

.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  gap: var(--space-4);
}

.dashboard__activity {
  grid-column: 1 / -1;
}
</style>
