<script setup>
import { computed, onMounted, reactive, ref } from 'vue';

import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppSelect,
  AppTable,
} from '../../components/ui/index.js';
import DashboardKpi from '../../features/dashboard/DashboardKpi.vue';
import DashboardKpiGrid from '../../features/dashboard/DashboardKpiGrid.vue';
import { surveyorActivityService } from '../../services/surveyor-activity.service.js';
import { useI18n } from '../../i18n/index.js';

const { t } = useI18n();

const filters = reactive({
  from: '',
  to: '',
  surveyorId: '',
  surveyId: '',
  surveyVersionId: '',
  campaignId: '',
  locationStatus: 'all',
});

const summary = ref(null);
const responses = ref([]);
const mapPoints = ref([]);
const loading = ref(false);
const error = ref('');

const locationStatusOptions = computed(() => [
  { value: 'all', label: t('surveyorActivity.filters.locationAll') },
  { value: 'present', label: t('surveyorActivity.filters.locationPresent') },
  { value: 'missing', label: t('surveyorActivity.filters.locationMissing') },
  { value: 'low_accuracy', label: t('surveyorActivity.filters.locationLowAccuracy') },
]);

const cleanFilters = () => ({
  from: filters.from || null,
  to: filters.to || null,
  surveyorId: filters.surveyorId || null,
  surveyId: filters.surveyId || null,
  surveyVersionId: filters.surveyVersionId || null,
  campaignId: filters.campaignId || null,
  locationStatus: filters.locationStatus === 'all' ? null : filters.locationStatus,
});

const formatNumber = (value) => new Intl.NumberFormat().format(value ?? 0);

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const kpis = computed(() => {
  const totals = summary.value?.totals ?? {};
  const suspicious = summary.value?.suspicious ?? {};
  return [
    {
      key: 'responses',
      label: t('surveyorActivity.kpis.responses'),
      value: formatNumber(totals.responses),
      tone: 'primary',
    },
    {
      key: 'surveyors',
      label: t('surveyorActivity.kpis.surveyors'),
      value: formatNumber(totals.surveyors),
    },
    {
      key: 'withLocation',
      label: t('surveyorActivity.kpis.withLocation'),
      value: formatNumber(totals.withLocation),
    },
    {
      key: 'missingLocation',
      label: t('surveyorActivity.kpis.missingLocation'),
      value: formatNumber(suspicious.missingLocation),
      tone: suspicious.missingLocation > 0 ? 'warning' : 'default',
    },
    {
      key: 'lowAccuracy',
      label: t('surveyorActivity.kpis.lowAccuracy'),
      value: formatNumber(suspicious.lowAccuracy),
      tone: suspicious.lowAccuracy > 0 ? 'warning' : 'default',
    },
    {
      key: 'bursts',
      label: t('surveyorActivity.kpis.bursts'),
      value: formatNumber(suspicious.unusualSubmissionBurst),
      tone: suspicious.unusualSubmissionBurst > 0 ? 'warning' : 'default',
    },
  ];
});

const surveyorColumns = computed(() => [
  { key: 'surveyorName', label: t('surveyorActivity.columns.surveyor'), minWidth: '180px' },
  { key: 'totalResponses', label: t('surveyorActivity.columns.responses'), align: 'right' },
  { key: 'withLocation', label: t('surveyorActivity.columns.withLocation'), align: 'right' },
  { key: 'missingLocation', label: t('surveyorActivity.columns.missing'), align: 'right' },
  { key: 'lowAccuracy', label: t('surveyorActivity.columns.lowAccuracy'), align: 'right' },
]);

const responseColumns = computed(() => [
  { key: 'submittedAt', label: t('surveyorActivity.columns.submittedAt'), minWidth: '160px' },
  { key: 'surveyorName', label: t('surveyorActivity.columns.surveyor'), minWidth: '160px' },
  { key: 'surveyTitle', label: t('surveyorActivity.columns.survey'), minWidth: '160px' },
  { key: 'locationStatus', label: t('surveyorActivity.columns.location') },
  { key: 'accuracy', label: t('surveyorActivity.columns.accuracy'), align: 'right' },
  { key: 'flags', label: t('surveyorActivity.columns.flags'), minWidth: '180px' },
]);

const responseRows = computed(() =>
  responses.value.map((row) => ({
    ...row,
    submittedAt: formatDate(row.submittedAt),
    accuracy: row.location?.accuracyMeters ?? '-',
    flags: row.suspiciousFlags?.length ? row.suspiciousFlags.join(', ') : '-',
  })),
);

const loadActivity = async () => {
  loading.value = true;
  error.value = '';
  try {
    const query = cleanFilters();
    const [summaryData, responseData, mapData] = await Promise.all([
      surveyorActivityService.summary(query),
      surveyorActivityService.responses({ ...query, limit: 50 }),
      surveyorActivityService.map({ ...query, limit: 200 }),
    ]);
    summary.value = summaryData?.summary ?? null;
    responses.value = responseData?.items ?? [];
    mapPoints.value = mapData?.points ?? [];
  } catch (err) {
    error.value = err?.message ?? t('surveyorActivity.loadError');
  } finally {
    loading.value = false;
  }
};

const resetFilters = () => {
  filters.from = '';
  filters.to = '';
  filters.surveyorId = '';
  filters.surveyId = '';
  filters.surveyVersionId = '';
  filters.campaignId = '';
  filters.locationStatus = 'all';
  loadActivity();
};

const downloadExport = async (format = 'csv') => {
  try {
    const file = await surveyorActivityService.export({ ...cleanFilters(), format });
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err?.message ?? t('surveyorActivity.exportError');
  }
};

onMounted(loadActivity);
</script>

<template>
  <section class="surveyor-activity">
    <header class="surveyor-activity__header">
      <div>
        <h2>{{ t('surveyorActivity.title') }}</h2>
        <p>{{ t('surveyorActivity.subtitle') }}</p>
      </div>
      <div class="surveyor-activity__actions">
        <AppButton size="sm" variant="secondary" :disabled="loading" @click="loadActivity">
          {{ t('common.refresh') }}
        </AppButton>
        <AppButton size="sm" variant="secondary" @click="downloadExport('csv')">
          {{ t('surveyorActivity.exportCsv') }}
        </AppButton>
        <AppButton size="sm" variant="secondary" @click="downloadExport('xlsx')">
          {{ t('surveyorActivity.exportXlsx') }}
        </AppButton>
      </div>
    </header>

    <AppAlert v-if="error" variant="error">{{ error }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('surveyorActivity.filters.title') }}</template>
      <form class="surveyor-activity__filters" @submit.prevent="loadActivity">
        <AppInput
          v-model="filters.from"
          type="datetime-local"
          :label="t('surveyorActivity.filters.from')"
        />
        <AppInput
          v-model="filters.to"
          type="datetime-local"
          :label="t('surveyorActivity.filters.to')"
        />
        <AppInput v-model="filters.surveyorId" :label="t('surveyorActivity.filters.surveyorId')" />
        <AppInput v-model="filters.surveyId" :label="t('surveyorActivity.filters.surveyId')" />
        <AppSelect
          v-model="filters.locationStatus"
          :label="t('surveyorActivity.filters.location')"
          :options="locationStatusOptions"
        />
        <div class="surveyor-activity__filter-actions">
          <AppButton type="submit" variant="primary" :loading="loading">
            {{ t('common.apply') }}
          </AppButton>
          <AppButton type="button" variant="ghost" @click="resetFilters">
            {{ t('common.reset') }}
          </AppButton>
        </div>
      </form>
    </AppCard>

    <DashboardKpiGrid>
      <DashboardKpi
        v-for="item in kpis"
        :key="item.key"
        :label="item.label"
        :value="item.value"
        :tone="item.tone"
      />
    </DashboardKpiGrid>

    <section class="surveyor-activity__grid">
      <AppCard padded>
        <template #title>{{ t('surveyorActivity.bySurveyor') }}</template>
        <AppTable
          :columns="surveyorColumns"
          :rows="summary?.bySurveyor ?? []"
          row-key="surveyorId"
          dense
          :loading="loading"
          :empty="t('surveyorActivity.empty')"
        />
      </AppCard>

      <AppCard padded>
        <template #title>{{ t('surveyorActivity.map.title') }}</template>
        <div class="surveyor-activity__map">
          <div
            v-for="point in mapPoints.slice(0, 40)"
            :key="point.responseId"
            class="surveyor-activity__point"
          >
            <span>{{ point.surveyorName || point.surveyorId }}</span>
            <strong>{{ point.latitude.toFixed(5) }}, {{ point.longitude.toFixed(5) }}</strong>
            <AppBadge v-if="point.suspiciousFlags?.length" variant="warning">
              {{ point.suspiciousFlags.length }}
            </AppBadge>
          </div>
          <p v-if="!loading && mapPoints.length === 0">{{ t('surveyorActivity.map.empty') }}</p>
        </div>
      </AppCard>
    </section>

    <AppCard padded>
      <template #title>{{ t('surveyorActivity.recentResponses') }}</template>
      <AppTable
        :columns="responseColumns"
        :rows="responseRows"
        row-key="id"
        dense
        max-height="520px"
        :loading="loading"
        :empty="t('surveyorActivity.empty')"
      >
        <template #cell:locationStatus="{ value }">
          <AppBadge :variant="value === 'present' ? 'success' : 'warning'">{{ value }}</AppBadge>
        </template>
      </AppTable>
    </AppCard>
  </section>
</template>

<style scoped>
.surveyor-activity {
  display: grid;
  gap: var(--space-5);
}

.surveyor-activity__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.surveyor-activity__header h2 {
  margin: 0;
}

.surveyor-activity__header p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.surveyor-activity__actions,
.surveyor-activity__filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.surveyor-activity__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
  align-items: end;
}

.surveyor-activity__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: var(--space-5);
}

.surveyor-activity__map {
  display: grid;
  gap: var(--space-2);
  max-height: 360px;
  overflow: auto;
}

.surveyor-activity__point {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.surveyor-activity__point span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .surveyor-activity__header,
  .surveyor-activity__grid {
    grid-template-columns: 1fr;
  }

  .surveyor-activity__header {
    display: grid;
  }
}
</style>
