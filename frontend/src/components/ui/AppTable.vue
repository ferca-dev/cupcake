<script setup>
// Responsive data table. Wraps the native <table> in a scroll container so
// long lists scroll vertically without overflowing the page, wide column sets
// scroll horizontally, and the header stays pinned to the top of the viewport
// (or the configured `maxHeight`) while the body scrolls.
//
// Props:
//   - columns:    `[{ key, label, align?, width?, minWidth?, sticky? }]`
//   - rows:       `Array<Record<string, unknown>>`
//   - rowKey:     field used as :key
//   - empty:      message shown when rows is empty (or use the `empty` slot)
//   - loading:    boolean — renders the loading state row
//   - error:      string or Error — renders the error state row
//   - maxHeight:  CSS value — caps the body height to enable vertical scroll
//   - dense:      compact padding for data-dense screens
//
// Use scoped slots `cell:<key>` to override a cell renderer, and `empty`,
// `loading`, or `error` to override the matching state. Long text inside a
// cell is wrapped via CSS so the layout never breaks horizontally.
import { computed } from 'vue';

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'id' },
  empty: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: [String, Object], default: null },
  maxHeight: { type: String, default: '' },
  dense: { type: Boolean, default: false },
});

defineSlots();

const containerStyle = computed(() => (props.maxHeight ? { maxHeight: props.maxHeight } : null));

const errorMessage = computed(() => {
  if (!props.error) return '';
  if (typeof props.error === 'string') return props.error;
  return props.error.message ?? 'Something went wrong.';
});

const showLoadingState = computed(() => props.loading && !props.rows.length);
const showErrorState = computed(() => !props.loading && Boolean(props.error) && !props.rows.length);
const showEmptyState = computed(
  () => !props.loading && !props.error && props.rows.length === 0,
);

const valueAt = (row, key) =>
  key.split('.').reduce((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in acc) return acc[segment];
    return undefined;
  }, row);

const columnStyle = (column) => {
  const style = {};
  if (column.width) style.width = column.width;
  if (column.minWidth) style.minWidth = column.minWidth;
  return Object.keys(style).length ? style : undefined;
};

const columnClasses = (column) => ({
  [`text-${column.align}`]: Boolean(column.align),
  'app-table__cell--sticky-right': column.sticky === 'right',
  'app-table__cell--sticky-left': column.sticky === 'left',
});

defineExpose({ valueAt });
</script>

<template>
  <div
    class="app-table"
    :class="{ 'app-table--dense': dense, 'app-table--scroll-y': Boolean(maxHeight) }"
    :aria-busy="loading || undefined"
    :style="containerStyle"
  >
    <table>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :style="columnStyle(column)"
            :class="columnClasses(column)"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="showLoadingState">
          <td :colspan="columns.length" class="app-table__state">
            <slot name="loading">Loading…</slot>
          </td>
        </tr>
        <tr v-else-if="showErrorState">
          <td :colspan="columns.length" class="app-table__state app-table__state--error">
            <slot name="error" :message="errorMessage">{{ errorMessage }}</slot>
          </td>
        </tr>
        <tr v-else-if="showEmptyState">
          <td :colspan="columns.length" class="app-table__state">
            <slot name="empty">{{ empty || 'No data to display' }}</slot>
          </td>
        </tr>
        <tr v-for="row in rows" v-else :key="row[rowKey] ?? row.id ?? JSON.stringify(row)">
          <td
            v-for="column in columns"
            :key="column.key"
            :class="columnClasses(column)"
            :style="columnStyle(column)"
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
  overflow: auto;
  position: relative;
  width: 100%;
  /* Disable native overscroll bounce so the sticky header stays glued. */
  overscroll-behavior: contain;
}

.app-table--scroll-y {
  /* maxHeight prop is applied inline; ensure the inner table can grow. */
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

th,
td {
  padding: var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
  vertical-align: middle;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.app-table--dense th,
.app-table--dense td {
  padding: var(--space-2) var(--space-3);
}

th {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--font-size-xs);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 2;
  box-shadow: inset 0 -1px 0 var(--color-border);
}

tbody tr:last-child td {
  border-bottom: 0;
}

tbody tr:hover {
  background: var(--color-surface-muted);
}

.app-table__state {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-6);
}

.app-table__state--error {
  color: var(--color-danger-700);
}

.app-table__cell--sticky-right {
  position: sticky;
  right: 0;
  background: var(--color-surface);
  box-shadow: -1px 0 0 var(--color-border);
}

th.app-table__cell--sticky-right {
  background: var(--color-surface-muted);
  z-index: 3;
}

.app-table__cell--sticky-left {
  position: sticky;
  left: 0;
  background: var(--color-surface);
  box-shadow: 1px 0 0 var(--color-border);
}

th.app-table__cell--sticky-left {
  background: var(--color-surface-muted);
  z-index: 3;
}

.text-right {
  text-align: right;
}
.text-center {
  text-align: center;
}
</style>
