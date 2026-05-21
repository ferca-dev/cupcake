<script setup>
// Central canvas. Renders the in-progress form preview and owns
// drag-and-drop:
//   - drops from the sidebar (mime `application/x-cupcake-field-type`)
//     append a new field at the drop position.
//   - drops from another field on the canvas (in-flight via `dragFieldId`)
//     reorder fields.
//
// Drag-state lives in component refs and is not persisted on the store, so
// the schema only changes when a gesture lands.
import { computed, ref } from 'vue';

import { useI18n } from '../../i18n/index.js';
import BuilderFieldRenderer from './BuilderFieldRenderer.vue';
import BuilderFieldWrapper from './BuilderFieldWrapper.vue';

const props = defineProps({
  fields: { type: Array, default: () => [] },
  selectedFieldId: { type: String, default: null },
  fieldIssueIds: { type: Set, default: () => new Set() },
  previewMode: { type: String, default: 'desktop' },
  hiddenFieldIds: { type: Set, default: () => new Set() },
});

const emit = defineEmits([
  'select-field',
  'duplicate-field',
  'remove-field',
  'add-field',
  'reorder-fields',
  'clear-selection',
]);

const { t } = useI18n();

const dragFieldId = ref(null);
const dragOverIndex = ref(null);

const previewWidth = computed(() => {
  if (props.previewMode === 'mobile') return '24rem';
  if (props.previewMode === 'tablet') return '40rem';
  return '100%';
});

const onSelect = (fieldId) => emit('select-field', fieldId);
const onDuplicate = (fieldId) => emit('duplicate-field', fieldId);
const onRemove = (fieldId) => emit('remove-field', fieldId);

const onFieldDragStart = ({ fieldId, event }) => {
  dragFieldId.value = fieldId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-cupcake-field-id', fieldId);
};

const onFieldDragEnd = () => {
  dragFieldId.value = null;
  dragOverIndex.value = null;
};

const onItemDragOver = (event, index) => {
  if (event.dataTransfer.types.includes('application/x-cupcake-field-type')) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    dragOverIndex.value = index;
    return;
  }
  if (event.dataTransfer.types.includes('application/x-cupcake-field-id')) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dragOverIndex.value = index;
  }
};

const onItemDrop = (event, index) => {
  const fieldType = event.dataTransfer.getData('application/x-cupcake-field-type');
  if (fieldType) {
    event.preventDefault();
    emit('add-field', { type: fieldType, index });
    dragOverIndex.value = null;
    return;
  }
  const movingId = event.dataTransfer.getData('application/x-cupcake-field-id');
  if (movingId) {
    event.preventDefault();
    const sourceIndex = props.fields.findIndex((field) => field.id === movingId);
    if (sourceIndex >= 0 && sourceIndex !== index) {
      emit('reorder-fields', { sourceIndex, targetIndex: index });
    }
    dragOverIndex.value = null;
    dragFieldId.value = null;
  }
};

const onListDragOver = (event) => {
  if (
    event.dataTransfer.types.includes('application/x-cupcake-field-type') ||
    event.dataTransfer.types.includes('application/x-cupcake-field-id')
  ) {
    event.preventDefault();
    if (
      !dragFieldId.value &&
      event.dataTransfer.types.includes('application/x-cupcake-field-type')
    ) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }
};

const onListDrop = (event) => {
  const fieldType = event.dataTransfer.getData('application/x-cupcake-field-type');
  if (fieldType) {
    event.preventDefault();
    emit('add-field', { type: fieldType, index: props.fields.length });
    dragOverIndex.value = null;
    return;
  }
  const movingId = event.dataTransfer.getData('application/x-cupcake-field-id');
  if (movingId) {
    event.preventDefault();
    const sourceIndex = props.fields.findIndex((field) => field.id === movingId);
    const targetIndex = props.fields.length - 1;
    if (sourceIndex >= 0 && sourceIndex !== targetIndex) {
      emit('reorder-fields', { sourceIndex, targetIndex });
    }
    dragOverIndex.value = null;
    dragFieldId.value = null;
  }
};

const onBlankClick = () => emit('clear-selection');
</script>

<template>
  <section class="builder-canvas" @click.self="onBlankClick">
    <ul
      class="builder-canvas__page"
      :style="{ maxWidth: previewWidth }"
      @click.self="onBlankClick"
      @dragover="onListDragOver"
      @drop="onListDrop"
    >
      <li v-if="fields.length === 0" class="builder-canvas__empty">
        <h4>{{ t('builder.canvas.emptyTitle') }}</h4>
        <p>{{ t('builder.canvas.emptyHint') }}</p>
      </li>

      <li
        v-for="(field, index) in fields"
        :key="field.id"
        class="builder-canvas__slot"
        @dragover="(event) => onItemDragOver(event, index)"
        @drop="(event) => onItemDrop(event, index)"
      >
        <BuilderFieldWrapper
          :field="field"
          :is-selected="field.id === selectedFieldId"
          :has-issues="fieldIssueIds.has(field.id)"
          :is-dragging="dragFieldId === field.id"
          :is-drop-target="dragOverIndex === index"
          :is-hidden-by-logic="hiddenFieldIds.has(field.id)"
          @select="onSelect"
          @duplicate="onDuplicate"
          @remove="onRemove"
          @dragstart="onFieldDragStart"
          @dragend="onFieldDragEnd"
        >
          <BuilderFieldRenderer :field="field" />
        </BuilderFieldWrapper>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.builder-canvas {
  flex: 1;
  background: var(--color-surface-muted);
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  justify-content: center;
}

.builder-canvas__page {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  min-height: 100%;
  box-shadow: var(--shadow-sm);
  list-style: none;
  margin: 0;
}

.builder-canvas__slot {
  list-style: none;
}

.builder-canvas__empty {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-7);
  text-align: center;
  color: var(--color-text-muted);
}

.builder-canvas__empty h4 {
  margin: 0 0 var(--space-2) 0;
}

.builder-canvas__empty p {
  margin: 0;
}

@media (max-width: 900px) {
  .builder-canvas {
    padding: var(--space-3);
  }
  .builder-canvas__page {
    padding: var(--space-3);
  }
}
</style>
