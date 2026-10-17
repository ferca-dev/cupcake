<script setup>
// Left palette. Lists every supported field type grouped by category. Each
// card is a button (click to append) and a drag source (drag onto the
// canvas). The drag payload uses a custom mime so canvas drops can tell a
// "new field" gesture apart from a "reorder" gesture.
import { useI18n } from '../../i18n/index.js';
import { FIELD_CATALOG, FIELD_CATEGORIES } from '../../features/builder/builder.constants.js';

const props = defineProps({
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['add']);

const { t } = useI18n();

const categoriesWithFields = FIELD_CATEGORIES.map((category) => ({
  ...category,
  fields: FIELD_CATALOG.filter((field) => field.category === category.key),
})).filter((category) => category.fields.length > 0);

const onClick = (type) => {
  if (props.disabled) return;
  emit('add', type);
};

const onDragStart = (event, type) => {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-cupcake-field-type', type);
  // Some browsers refuse to start the drag if no text/plain payload is set.
  event.dataTransfer.setData('text/plain', type);
};
</script>

<template>
  <aside class="builder-sidebar" :aria-label="t('builder.sidebar.title')">
    <header class="builder-sidebar__header">
      <h3>{{ t('builder.sidebar.title') }}</h3>
      <p>{{ t('builder.sidebar.subtitle') }}</p>
    </header>

    <div
      v-for="category in categoriesWithFields"
      :key="category.key"
      class="builder-sidebar__group"
    >
      <h4 class="builder-sidebar__group-title">{{ category.label }}</h4>
      <div class="builder-sidebar__grid">
        <button
          v-for="field in category.fields"
          :key="field.type"
          type="button"
          class="builder-sidebar__card"
          :draggable="!disabled"
          :disabled="disabled"
          :title="field.description"
          @click="onClick(field.type)"
          @dragstart="(event) => onDragStart(event, field.type)"
        >
          <span class="builder-sidebar__icon" aria-hidden="true">{{ field.icon }}</span>
          <span class="builder-sidebar__label">{{
            field.labelKey ? t(field.labelKey) : field.label
          }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.builder-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

.builder-sidebar__header h3 {
  margin: 0;
  font-size: var(--font-size-md);
}

.builder-sidebar__header p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.builder-sidebar__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.builder-sidebar__group-title {
  margin: 0;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.builder-sidebar__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.builder-sidebar__card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: grab;
  font: inherit;
  color: var(--color-text);
  text-align: left;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease;
}

.builder-sidebar__card:hover:not(:disabled) {
  background: var(--color-surface);
  border-color: var(--color-primary-300);
  box-shadow: var(--shadow-sm);
}

.builder-sidebar__card:active {
  cursor: grabbing;
}

.builder-sidebar__card:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.builder-sidebar__icon {
  font-size: 1.1rem;
}

.builder-sidebar__label {
  font-size: var(--font-size-sm);
  font-weight: 500;
}
</style>
