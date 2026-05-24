<script setup>
import { onMounted, reactive } from 'vue';
import { RouterLink } from 'vue-router';

import { surveyorService } from '../../services/surveyor.service.js';
import { useI18n } from '../../i18n/index.js';
import { AppAlert, AppButton, AppCard, AppLoader, AppTable } from '../../components/ui/index.js';

const { t } = useI18n();

const state = reactive({
  loading: true,
  error: null,
  surveys: [],
});

const columns = [
  { key: 'title', label: t('surveyor.surveys.columns.title') },
  { key: 'updatedAt', label: t('surveyor.surveys.columns.updatedAt') },
  { key: 'actions', label: t('surveyor.surveys.columns.actions'), align: 'right' },
];

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

const loadSurveys = async () => {
  state.loading = true;
  state.error = null;
  try {
    const data = await surveyorService.listSurveys();
    state.surveys = data?.items ?? [];
  } catch (err) {
    state.error = err?.message ?? t('surveyor.surveys.loadError');
  } finally {
    state.loading = false;
  }
};

onMounted(loadSurveys);
</script>

<template>
  <section class="surveyor-surveys">
    <header class="surveyor-surveys__header">
      <div>
        <h2>{{ t('surveyor.surveys.title') }}</h2>
        <p>{{ t('surveyor.surveys.subtitle') }}</p>
      </div>
    </header>

    <AppAlert v-if="state.error" variant="error">{{ state.error }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('surveyor.surveys.availableTitle') }}</template>
      <AppLoader v-if="state.loading && state.surveys.length === 0" />
      <AppTable
        v-else
        :columns="columns"
        :rows="state.surveys"
        row-key="id"
        :empty="t('surveyor.surveys.empty')"
      >
        <template #cell:title="{ row }">
          <div class="surveyor-surveys__title-cell">
            <strong>{{ row.title }}</strong>
            <span v-if="row.description">{{ row.description }}</span>
          </div>
        </template>
        <template #cell:updatedAt="{ row }">{{ formatDate(row.updatedAt) }}</template>
        <template #cell:actions="{ row }">
          <RouterLink
            v-slot="{ navigate }"
            :to="{ name: 'surveyor.surveys.respond', params: { id: row.id } }"
            custom
          >
            <AppButton size="sm" @click="navigate">
              {{ t('surveyor.surveys.respond') }}
            </AppButton>
          </RouterLink>
        </template>
      </AppTable>
    </AppCard>
  </section>
</template>

<style scoped>
.surveyor-surveys {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.surveyor-surveys__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.surveyor-surveys__header p,
.surveyor-surveys__title-cell span {
  margin: 0;
  color: var(--color-text-muted);
}

.surveyor-surveys__title-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
</style>
