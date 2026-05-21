<script setup>
// Surveys list view. Provides the entry point into the builder: it lists
// drafts and published surveys for the current tenant and exposes a "New
// survey" modal that creates a blank draft and routes into the builder.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { surveyService } from '../../services/survey.service.js';
import { useBuilderStore } from '../../stores/builder.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppModal,
  AppTable,
  AppTextarea,
} from '../../components/ui/index.js';

const router = useRouter();
const builder = useBuilderStore();
const { t } = useI18n();

const items = ref([]);
const isLoading = ref(false);
const loadError = ref(null);

const isModalOpen = ref(false);
const draft = ref({ title: '', description: '', slug: '' });
const createError = ref(null);
const isCreating = ref(false);

const columns = [
  { key: 'title', label: t('surveys.list.columns.title') },
  { key: 'slug', label: t('surveys.list.columns.slug') },
  { key: 'status', label: t('surveys.list.columns.status') },
  { key: 'updatedAt', label: t('surveys.list.columns.updated') },
  { key: 'actions', label: t('surveys.list.columns.actions'), align: 'right' },
];

const rows = computed(() => items.value.map((item) => ({ ...item })));

const refresh = async () => {
  isLoading.value = true;
  loadError.value = null;
  try {
    const data = await surveyService.list({ limit: 50, sort: '-updatedAt' });
    items.value = data?.items ?? [];
  } catch (err) {
    loadError.value = err?.message ?? t('surveys.list.errors.load');
  } finally {
    isLoading.value = false;
  }
};

onMounted(refresh);

const openCreate = () => {
  draft.value = { title: '', description: '', slug: '' };
  createError.value = null;
  isModalOpen.value = true;
};

const closeCreate = () => {
  if (isCreating.value) return;
  isModalOpen.value = false;
};

const submitCreate = async () => {
  if (!draft.value.title.trim()) {
    createError.value = t('surveys.list.errors.titleRequired');
    return;
  }
  isCreating.value = true;
  createError.value = null;
  try {
    builder.reset();
    const created = await builder.createSurveyDraft({
      title: draft.value.title.trim(),
      description: draft.value.description.trim() || null,
      slug: draft.value.slug.trim() || undefined,
    });
    isModalOpen.value = false;
    if (created?.id) {
      router.push({ name: 'surveys.builder', params: { id: created.id } });
    } else {
      await refresh();
    }
  } catch (err) {
    createError.value = err?.message ?? t('surveys.list.errors.createFailed');
  } finally {
    isCreating.value = false;
  }
};

const editSurvey = (surveyId) => {
  router.push({ name: 'surveys.builder', params: { id: surveyId } });
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
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
</script>

<template>
  <section class="surveys-list">
    <header class="surveys-list__header">
      <div>
        <h2>{{ t('surveys.list.title') }}</h2>
        <p>{{ t('surveys.list.subtitle') }}</p>
      </div>
      <AppButton @click="openCreate">{{ t('surveys.list.newSurvey') }}</AppButton>
    </header>

    <AppAlert v-if="loadError" variant="error">{{ loadError }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('surveys.list.allSurveys') }}</template>
      <AppLoader v-if="isLoading && items.length === 0" />
      <AppTable
        v-else
        :columns="columns"
        :rows="rows"
        row-key="id"
        :empty="t('surveys.list.empty')"
      >
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
        <template #cell:updatedAt="{ row }">
          {{ formatDate(row.updatedAt) }}
        </template>
        <template #cell:actions="{ row }">
          <AppButton size="sm" variant="secondary" @click="editSurvey(row.id)">
            {{ t('surveys.list.open') }}
          </AppButton>
        </template>
      </AppTable>
    </AppCard>

    <AppModal v-model="isModalOpen" :title="t('surveys.list.modal.title')" @close="closeCreate">
      <div class="surveys-list__modal-body">
        <AppAlert v-if="createError" variant="error">{{ createError }}</AppAlert>
        <AppInput
          v-model="draft.title"
          :label="t('surveys.list.modal.titleField')"
          :hint="t('surveys.list.modal.titleHint')"
          required
        />
        <AppTextarea
          v-model="draft.description"
          :label="t('surveys.list.modal.descriptionField')"
          :rows="3"
        />
        <AppInput
          v-model="draft.slug"
          :label="t('surveys.list.modal.slugField')"
          :hint="t('surveys.list.modal.slugHint')"
        />
      </div>
      <template #footer>
        <AppButton variant="ghost" :disabled="isCreating" @click="closeCreate">
          {{ t('common.cancel') }}
        </AppButton>
        <AppButton :loading="isCreating" @click="submitCreate">
          {{ t('surveys.list.modal.submit') }}
        </AppButton>
      </template>
    </AppModal>
  </section>
</template>

<style scoped>
.surveys-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.surveys-list__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.surveys-list__header h2 {
  margin: 0;
}

.surveys-list__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.surveys-list__modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
