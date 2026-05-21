<script setup>
import { computed } from 'vue';

import { AppTable, AppBadge } from '../../components/ui/index.js';
import { useI18n } from '../../i18n/index.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  empty: { type: String, default: '' },
});

const { t } = useI18n();

const columns = computed(() => [
  { key: 'action', label: t('dashboard.client.tables.action') },
  { key: 'entity', label: t('dashboard.client.tables.entity') },
  { key: 'when', label: t('dashboard.client.tables.when'), align: 'right' },
]);

const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const rows = computed(() =>
  props.items.map((item) => ({
    id: item.id,
    action: item.action,
    entity: item.entityType,
    when: formatWhen(item.createdAt),
  })),
);

void AppBadge;
</script>

<template>
  <AppTable :columns="columns" :rows="rows" row-key="id" :empty="empty">
    <template #cell:action="{ row }">
      <code class="dashboard-activity__code">{{ row.action }}</code>
    </template>
  </AppTable>
</template>

<style scoped>
.dashboard-activity__code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--font-size-xs);
  background: var(--color-surface-muted);
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
}
</style>
