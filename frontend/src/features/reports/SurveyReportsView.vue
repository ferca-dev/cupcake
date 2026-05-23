<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppLoader,
  AppTable,
} from '../../components/ui/index.js';
import DashboardKpi from '../dashboard/DashboardKpi.vue';
import DashboardKpiGrid from '../dashboard/DashboardKpiGrid.vue';
import ReportBarChart from './ReportBarChart.vue';
import ReportFilters from './ReportFilters.vue';
import ReportSparkLine from './ReportSparkLine.vue';
import { useReportsStore } from '../../stores/reports.store.js';
import { useI18n } from '../../i18n/index.js';

const route = useRoute();
const router = useRouter();
const store = useReportsStore();
const { t } = useI18n();

const formatPercent = (value) => {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 10000) / 100}%`;
};

const formatNumber = (value) => {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat().format(value);
};

const formatSeconds = (value) => {
  if (value === null || value === undefined) return '—';
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value - minutes * 60);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const surveyId = computed(() => String(route.params.id ?? ''));

const overview = computed(() => store.overview);
const channels = computed(() => store.channels?.channels ?? []);
const questions = computed(() => store.questions?.questions ?? []);
const trends = computed(() => store.trends?.byDay ?? []);
const dropOff = computed(() => store.dropOff);
const timing = computed(() => store.timing);
const versions = computed(() => store.versions?.versions ?? []);

const overviewKpis = computed(() => {
  const data = overview.value;
  if (!data) return [];
  return [
    {
      key: 'totalResponses',
      label: t('reports.overview.totalResponses'),
      value: formatNumber(data.totals.totalResponses),
      tone: 'primary',
    },
    {
      key: 'completionRate',
      label: t('reports.overview.completionRate'),
      value: formatPercent(data.rates.completionRate),
    },
    {
      key: 'responseRate',
      label: t('reports.overview.responseRate'),
      value: formatPercent(data.rates.responseRate),
    },
    {
      key: 'audience',
      label: t('reports.overview.audienceSize'),
      value: formatNumber(data.totals.audienceSize),
    },
    {
      key: 'avgCompletion',
      label: t('reports.overview.avgCompletion'),
      value: formatSeconds(data.duration.averageSeconds),
    },
    {
      key: 'anonymous',
      label: t('reports.overview.anonymousResponses'),
      value: formatNumber(data.totals.anonymousResponses),
    },
  ];
});

const channelColumns = computed(() => [
  { key: 'channel', label: t('reports.channels.columns.channel') },
  { key: 'attempted', label: t('reports.channels.columns.attempted'), align: 'right' },
  { key: 'sent', label: t('reports.channels.columns.sent'), align: 'right' },
  { key: 'delivered', label: t('reports.channels.columns.delivered'), align: 'right' },
  { key: 'opened', label: t('reports.channels.columns.opened'), align: 'right' },
  { key: 'clicked', label: t('reports.channels.columns.clicked'), align: 'right' },
  { key: 'failed', label: t('reports.channels.columns.failed'), align: 'right' },
  { key: 'skipped', label: t('reports.channels.columns.skipped'), align: 'right' },
  { key: 'responses', label: t('reports.channels.columns.responses'), align: 'right' },
  { key: 'responseRate', label: t('reports.channels.columns.responseRate'), align: 'right' },
]);

const trendColumns = computed(() => [
  { key: 'date', label: t('reports.trends.columns.date') },
  { key: 'total', label: t('reports.trends.columns.total'), align: 'right' },
  { key: 'channelsCell', label: t('reports.trends.columns.byChannel') },
]);

const trendRows = computed(() =>
  trends.value.map((row) => ({
    ...row,
    channelsCell: Object.entries(row.channels)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${key}: ${count}`)
      .join(' · '),
  })),
);

const trendSparklinePoints = computed(() =>
  trends.value.map((row) => ({ label: row.date, value: row.total })),
);

const dropOffPageColumns = computed(() => [
  { key: 'label', label: t('reports.dropOff.columns.page') },
  { key: 'fieldCount', label: t('reports.dropOff.columns.fieldCount'), align: 'right' },
  { key: 'reached', label: t('reports.dropOff.columns.reached'), align: 'right' },
  { key: 'droppedFromPrevious', label: t('reports.dropOff.columns.dropped'), align: 'right' },
  { key: 'dropRateFromPrevious', label: t('reports.dropOff.columns.dropRate'), align: 'right' },
]);

const dropOffPageRows = computed(() => {
  const data = dropOff.value;
  if (!data) return [];
  return data.pages.map((page) => ({
    ...page,
    dropRateFromPrevious: formatPercent(page.dropRateFromPrevious),
  }));
});

const dropOffFieldColumns = computed(() => [
  { key: 'label', label: t('reports.dropOff.columns.field') },
  { key: 'type', label: t('reports.dropOff.columns.type') },
  { key: 'reached', label: t('reports.dropOff.columns.reached'), align: 'right' },
  { key: 'dropRateFromPrevious', label: t('reports.dropOff.columns.dropRate'), align: 'right' },
]);

const dropOffFieldRows = computed(() => {
  const data = dropOff.value;
  if (!data) return [];
  return data.fields.map((field) => ({
    ...field,
    dropRateFromPrevious: formatPercent(field.dropRateFromPrevious),
  }));
});

const timingColumns = computed(() => [
  { key: 'label', label: t('reports.timing.columns.bucket') },
  { key: 'count', label: t('reports.timing.columns.count'), align: 'right' },
]);

const versionColumns = computed(() => [
  { key: 'versionNumber', label: t('reports.versions.columns.version') },
  { key: 'publishedAt', label: t('reports.versions.columns.publishedAt') },
  { key: 'fieldCount', label: t('reports.versions.columns.fields'), align: 'right' },
  { key: 'responseCount', label: t('reports.versions.columns.responses'), align: 'right' },
  { key: 'isCurrentlyPublished', label: t('reports.versions.columns.current') },
]);

const versionRows = computed(() =>
  versions.value.map((version) => ({
    ...version,
    publishedAt: formatDate(version.publishedAt),
  })),
);

const distributionForQuestion = (question) =>
  (question.distribution ?? []).map((entry) => ({
    key: entry.value,
    label: entry.label || entry.value,
    value: entry.count,
  }));

const reloadAll = async () => {
  if (!surveyId.value) return;
  store.setSurvey(surveyId.value);
  await store.fetchAll();
};

const onApplyFilters = async (filters) => {
  // Only forward non-empty filters into the store so we don't send empty
  // strings down the wire; the cleaner is centralised in the store getter.
  store.setFilters({
    from: filters.from || null,
    to: filters.to || null,
    channel: filters.channel || null,
    campaignId: filters.campaignId || null,
    surveyVersionId: filters.surveyVersionId || null,
    completionStatus: filters.completionStatus || 'all',
  });
  await store.fetchAll();
};

const onResetFilters = async () => {
  store.resetFilters();
  await store.fetchAll();
};

const downloadResponses = () => {
  const url = store.exportUrl({ type: 'responses', format: 'csv' });
  if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
};

const downloadQuestions = () => {
  const url = store.exportUrl({ type: 'questions', format: 'csv' });
  if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
};

const back = () => router.push({ name: 'surveys.list' });

onMounted(reloadAll);

watch(
  () => route.params.id,
  () => {
    reloadAll();
  },
);
</script>

<template>
  <section class="survey-reports-view">
    <header class="survey-reports-view__header">
      <AppButton variant="ghost" size="sm" @click="back">← {{ t('common.back') }}</AppButton>
      <div v-if="overview" class="survey-reports-view__title">
        <h2>{{ t('reports.title', { title: overview.title }) }}</h2>
        <AppBadge :variant="overview.status === 'published' ? 'success' : 'info'">
          {{ overview.status }}
        </AppBadge>
      </div>
      <div class="survey-reports-view__actions">
        <AppButton size="sm" variant="secondary" @click="reloadAll">
          {{ t('reports.refresh') }}
        </AppButton>
        <AppButton size="sm" variant="secondary" @click="downloadResponses">
          {{ t('reports.export.responses') }}
        </AppButton>
        <AppButton size="sm" variant="secondary" @click="downloadQuestions">
          {{ t('reports.export.questions') }}
        </AppButton>
      </div>
    </header>

    <ReportFilters
      :filters="store.filters"
      :versions="versions"
      @apply="onApplyFilters"
      @reset="onResetFilters"
    />

    <AppLoader v-if="store.loading.overview && !overview" />

    <template v-else-if="overview">
      <DashboardKpiGrid>
        <DashboardKpi
          v-for="kpi in overviewKpis"
          :key="kpi.key"
          :label="kpi.label"
          :value="kpi.value"
          :tone="kpi.tone ?? 'neutral'"
        />
      </DashboardKpiGrid>
    </template>

    <AppAlert v-if="store.errors.overview" variant="error">{{ store.errors.overview }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('reports.channels.title') }}</template>
      <AppLoader v-if="store.loading.channels && !channels.length" />
      <AppTable
        v-else
        :columns="channelColumns"
        :rows="channels"
        row-key="channel"
        :empty="t('reports.channels.empty')"
      >
        <template #cell:responseRate="{ row }">{{ formatPercent(row.responseRate) }}</template>
      </AppTable>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('reports.trends.title') }}</template>
      <AppLoader v-if="store.loading.trends && !trends.length" />
      <template v-else>
        <ReportSparkLine
          v-if="trendSparklinePoints.length"
          :points="trendSparklinePoints"
          :aria-label="t('reports.trends.title')"
        />
        <AppTable
          :columns="trendColumns"
          :rows="trendRows"
          row-key="date"
          :empty="t('reports.trends.empty')"
        />
      </template>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('reports.questions.title') }}</template>
      <AppLoader v-if="store.loading.questions && !questions.length" />
      <div v-else-if="!questions.length" class="survey-reports-view__empty">
        {{ t('reports.questions.empty') }}
      </div>
      <ul v-else class="survey-reports-view__questions">
        <li v-for="question in questions" :key="question.fieldId" class="survey-reports-view__question">
          <div class="survey-reports-view__question-header">
            <h4>{{ question.label || question.key || question.fieldId }}</h4>
            <AppBadge variant="info">{{ question.type }}</AppBadge>
          </div>
          <p class="survey-reports-view__question-meta">
            {{ t('reports.questions.summary', {
              responses: question.responseCount,
              skipped: question.skipCount,
              rate: formatPercent(question.responseRate),
            }) }}
          </p>
          <ReportBarChart
            v-if="question.distribution && question.distribution.length"
            :rows="distributionForQuestion(question)"
            :format-value="(value) => formatNumber(value)"
          />
          <div v-if="question.nps" class="survey-reports-view__nps">
            <div>
              <strong>{{ t('reports.questions.nps.score') }}</strong>: {{ question.nps.score ?? '—' }}
            </div>
            <div>{{ t('reports.questions.nps.promoters') }}: {{ question.nps.promoters }}</div>
            <div>{{ t('reports.questions.nps.passives') }}: {{ question.nps.passives }}</div>
            <div>{{ t('reports.questions.nps.detractors') }}: {{ question.nps.detractors }}</div>
          </div>
          <div v-if="question.numericSummary" class="survey-reports-view__numeric">
            <div>{{ t('reports.questions.numeric.average') }}: {{ question.numericSummary.average ?? '—' }}</div>
            <div>{{ t('reports.questions.numeric.median') }}: {{ question.numericSummary.median ?? '—' }}</div>
            <div>{{ t('reports.questions.numeric.min') }}: {{ question.numericSummary.min ?? '—' }}</div>
            <div>{{ t('reports.questions.numeric.max') }}: {{ question.numericSummary.max ?? '—' }}</div>
          </div>
        </li>
      </ul>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('reports.dropOff.title') }}</template>
      <AppLoader v-if="store.loading.dropOff && !dropOff" />
      <template v-else-if="dropOff">
        <h4 class="survey-reports-view__section-title">{{ t('reports.dropOff.pages') }}</h4>
        <AppTable
          :columns="dropOffPageColumns"
          :rows="dropOffPageRows"
          row-key="pageIndex"
          :empty="t('reports.dropOff.empty')"
        />
        <h4 class="survey-reports-view__section-title">{{ t('reports.dropOff.fields') }}</h4>
        <AppTable
          :columns="dropOffFieldColumns"
          :rows="dropOffFieldRows"
          row-key="fieldId"
          :empty="t('reports.dropOff.empty')"
        />
      </template>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('reports.timing.title') }}</template>
      <AppLoader v-if="store.loading.timing && !timing" />
      <template v-else-if="timing">
        <DashboardKpiGrid>
          <DashboardKpi :label="t('reports.timing.average')" :value="formatSeconds(timing.duration.averageSeconds)" />
          <DashboardKpi :label="t('reports.timing.median')" :value="formatSeconds(timing.duration.medianSeconds)" />
          <DashboardKpi :label="t('reports.timing.min')" :value="formatSeconds(timing.duration.minSeconds)" />
          <DashboardKpi :label="t('reports.timing.max')" :value="formatSeconds(timing.duration.maxSeconds)" />
          <DashboardKpi :label="t('reports.timing.trimmedMean')" :value="formatSeconds(timing.duration.trimmedMeanSeconds)" />
        </DashboardKpiGrid>
        <AppTable
          :columns="timingColumns"
          :rows="timing.distribution"
          row-key="label"
          :empty="t('reports.timing.empty')"
        />
      </template>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('reports.versions.title') }}</template>
      <AppLoader v-if="store.loading.versions && !versions.length" />
      <AppTable
        v-else
        :columns="versionColumns"
        :rows="versionRows"
        row-key="id"
        :empty="t('reports.versions.empty')"
      >
        <template #cell:isCurrentlyPublished="{ row }">
          <AppBadge :variant="row.isCurrentlyPublished ? 'success' : 'neutral'">
            {{ row.isCurrentlyPublished ? t('reports.versions.current') : t('reports.versions.historical') }}
          </AppBadge>
        </template>
      </AppTable>
    </AppCard>
  </section>
</template>

<style scoped>
.survey-reports-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.survey-reports-view__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.survey-reports-view__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.survey-reports-view__title h2 {
  margin: 0;
}

.survey-reports-view__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.survey-reports-view__questions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.survey-reports-view__question {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.survey-reports-view__question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.survey-reports-view__question-header h4 {
  margin: 0;
}

.survey-reports-view__question-meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.survey-reports-view__nps,
.survey-reports-view__numeric {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.survey-reports-view__empty {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.survey-reports-view__section-title {
  margin: var(--space-3) 0 var(--space-2);
}
</style>
