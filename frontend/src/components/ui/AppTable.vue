<script setup>
// Simple data table. Props:
//   - columns: `[{ key, label, align?, width? }]`
//   - rows:    `Array<Record<string, unknown>>`
//   - rowKey:  field used as :key
//   - empty:   message shown when rows is empty
// Use scoped slots `cell:<key>` to override a cell renderer.
const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'id' },
  empty: { type: String, default: '' },
  loading: { type: Boolean, default: false },
});

defineSlots();

const valueAt = (row, key) => {
  return key.split('.').reduce((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in acc) return acc[segment];
    return undefined;
  }, row);
};

defineExpose({ valueAt });

// Avoid lint for unused props
void props;
</script>

<template>
  <div class="app-table" :aria-busy="loading || undefined">
    <table>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :style="column.width ? { width: column.width } : undefined"
            :class="column.align ? `text-${column.align}` : undefined"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="columns.length" class="app-table__state">Loading…</td>
        </tr>
        <tr v-else-if="!rows.length">
          <td :colspan="columns.length" class="app-table__state">
            {{ empty || 'No data to display' }}
          </td>
        </tr>
        <tr v-for="row in rows" v-else :key="row[rowKey] ?? row.id ?? JSON.stringify(row)">
          <td
            v-for="column in columns"
            :key="column.key"
            :class="column.align ? `text-${column.align}` : undefined"
          >
            <slot :name="`cell:${column.key}`" :row="row" :value="valueAt(row, column.key)">
              {{ valueAt(row, column.key) }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.app-table {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}

th {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--font-size-xs);
}

tbody tr:last-child td {
  border-bottom: 0;
}

.app-table__state {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-5);
}

.text-right {
  text-align: right;
}
.text-center {
  text-align: center;
}
</style>
