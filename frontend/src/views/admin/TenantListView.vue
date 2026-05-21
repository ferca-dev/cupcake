<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAdminStore } from '../../stores/admin.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppSelect,
  AppTable,
} from '../../components/ui/index.js';

const store = useAdminStore();
const router = useRouter();
const { t } = useI18n();

const search = ref('');
const statusFilter = ref('');
let searchTimer = null;

const items = computed(() => store.tenants);
const pagination = computed(() => store.pagination);
const isLoading = computed(() => store.isLoadingList);
const loadError = computed(() => store.lastError);

const statusOptions = computed(() => [
  { value: '', label: t('adminPanel.tenants.filters.allStatuses') },
  { value: 'active', label: t('adminPanel.tenants.statuses.active') },
  { value: 'suspended', label: t('adminPanel.tenants.statuses.suspended') },
  { value: 'cancelled', label: t('adminPanel.tenants.statuses.cancelled') },
]);

const columns = computed(() => [
  { key: 'name', label: t('adminPanel.tenants.columns.name') },
  { key: 'slug', label: t('adminPanel.tenants.columns.slug') },
  { key: 'status', label: t('adminPanel.tenants.columns.status') },
  { key: 'userCount', label: t('adminPanel.tenants.columns.users'), align: 'right' },
  { key: 'createdAt', label: t('adminPanel.tenants.columns.createdAt'), align: 'right' },
  { key: 'actions', label: t('adminPanel.tenants.columns.actions'), align: 'right' },
]);

const refresh = async (patch = {}) => {
  try {
    await store.fetchTenants({
      ...patch,
      search: search.value.trim() || undefined,
      status: statusFilter.value || undefined,
      page: patch.page ?? 1,
    });
  } catch {
    // store.lastError handles the message via the alert below.
  }
};

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

const goToCreate = () => router.push({ name: 'admin.tenants.create' });
const goToDetail = (tenant) =>
  router.push({ name: 'admin.tenants.detail', params: { id: tenant.id } });

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refresh({ page: 1 }), 300);
});

watch(statusFilter, () => refresh({ page: 1 }));

onMounted(() => refresh());
</script>

<template>
  <section class="tenants-list">
    <header class="tenants-list__header">
      <div>
        <h2>{{ t('adminPanel.tenants.title') }}</h2>
        <p>{{ t('adminPanel.tenants.subtitle') }}</p>
      </div>
      <AppButton @click="goToCreate">
        {{ t('adminPanel.tenants.newTenant') }}
      </AppButton>
    </header>

    <AppAlert v-if="loadError" variant="error">
      {{ t('adminPanel.tenants.loadError') }}
    </AppAlert>

    <AppCard padded>
      <div class="tenants-list__filters">
        <AppInput
          v-model="search"
          :label="t('common.search')"
          :placeholder="t('adminPanel.tenants.filters.searchPlaceholder')"
        />
        <AppSelect
          v-model="statusFilter"
          :label="t('adminPanel.tenants.filters.status')"
          :options="statusOptions"
        />
      </div>
    </AppCard>

    <AppLoader v-if="isLoading && items.length === 0" />

    <AppTable
      v-else
      :columns="columns"
      :rows="items"
      row-key="id"
      :empty="t('adminPanel.tenants.empty')"
    >
      <template #cell:status="{ row }">
        <AppBadge :variant="statusVariant(row.status)">
          {{ t(`adminPanel.tenants.statuses.${row.status}`) }}
        </AppBadge>
      </template>
      <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
      <template #cell:actions="{ row }">
        <AppButton variant="ghost" size="sm" @click="goToDetail(row)">
          {{ t('adminPanel.tenants.open') }}
        </AppButton>
      </template>
    </AppTable>

    <p v-if="pagination" class="tenants-list__pagination">
      {{ t('adminPanel.tenants.pagination', { count: items.length, total: pagination.total ?? 0 }) }}
    </p>
  </section>
</template>

<style scoped>
.tenants-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 90rem;
}

.tenants-list__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.tenants-list__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.tenants-list__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.tenants-list__filters {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-3);
}

.tenants-list__pagination {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

@media (max-width: 720px) {
  .tenants-list__header {
    flex-direction: column;
    align-items: stretch;
  }
  .tenants-list__filters {
    grid-template-columns: 1fr;
  }
}
</style>
