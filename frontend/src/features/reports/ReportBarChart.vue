<script setup>
// Minimal horizontal bar chart implemented with CSS so the report views can
// surface distributions without importing a chart library. Each row renders a
// label, a numeric count, and a filled bar whose width is proportional to the
// maximum value in the dataset. Designed for low-data-density use; not a
// replacement for a proper charting layer when datasets grow.
import { computed } from 'vue';

const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  formatValue: {
    type: Function,
    default: (value) => String(value ?? ''),
  },
  emptyMessage: {
    type: String,
    default: 'No data to display.',
  },
});

const maxValue = computed(() => {
  let max = 0;
  for (const row of props.rows) {
    if (typeof row?.value === 'number' && row.value > max) max = row.value;
  }
  return max;
});

const percent = (value) => {
  if (!Number.isFinite(value) || maxValue.value === 0) return 0;
  return Math.max(2, Math.round((value / maxValue.value) * 100));
};
</script>

<template>
  <div v-if="rows.length === 0" class="report-bar-chart__empty">{{ emptyMessage }}</div>
  <ul v-else class="report-bar-chart">
    <li v-for="(row, idx) in rows" :key="row.key ?? idx" class="report-bar-chart__row">
      <div class="report-bar-chart__header">
        <span class="report-bar-chart__label">{{ row.label }}</span>
        <span class="report-bar-chart__value">{{ formatValue(row.value, row) }}</span>
      </div>
      <div class="report-bar-chart__track" :aria-hidden="true">
        <span class="report-bar-chart__fill" :style="{ width: `${percent(row.value)}%` }" />
      </div>
    </li>
  </ul>
</template>

<style scoped>
.report-bar-chart {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.report-bar-chart__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.report-bar-chart__header {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.report-bar-chart__label {
  font-weight: 500;
  word-break: break-word;
}

.report-bar-chart__value {
  color: var(--color-text-muted);
}

.report-bar-chart__track {
  width: 100%;
  background: var(--color-surface-muted);
  border-radius: var(--radius-sm);
  height: 0.5rem;
  overflow: hidden;
}

.report-bar-chart__fill {
  display: block;
  height: 100%;
  background: var(--color-primary-500);
  border-radius: var(--radius-sm);
}

.report-bar-chart__empty {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
