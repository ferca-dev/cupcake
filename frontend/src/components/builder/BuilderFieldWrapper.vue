<script setup>
// Visual wrapper around any field rendered on the canvas. Owns selection
// state, the inline action toolbar (duplicate / delete), and the drag
// handle. The actual field UI is rendered via the `default` slot, which
// `BuilderFieldRenderer` populates with a type-specific component.
import { computed } from 'vue';

import { useI18n } from '../../i18n/index.js';
import { FIELD_WIDTHS } from '../../features/builder/builder.constants.js';

const props = defineProps({
  field: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
  hasIssues: { type: Boolean, default: false },
  isDragging: { type: Boolean, default: false },
  isDropTarget: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'duplicate', 'remove', 'dragstart', 'dragend']);

const { t } = useI18n();

const widthClass = computed(() => {
  const width = props.field.settings?.width;
  return FIELD_WIDTHS.includes(width) ? `builder-field-wrapper--${width}` : 'builder-field-wrapper--full';
});

const onSelect = () => emit('select', props.field.id);
const onDuplicate = (event) => {
  event.stopPropagation();
  emit('duplicate', props.field.id);
};
const onRemove = (event) => {
  event.stopPropagation();
  emit('remove', props.field.id);
};

const onDragStart = (event) => {
  emit('dragstart', { fieldId: props.field.id, event });
};
const onDragEnd = (event) => {
  emit('dragend', { fieldId: props.field.id, event });
};
</script>

<template>
  <div
    :class="[
      'builder-field-wrapper',
      widthClass,
      {
        'is-selected': isSelected,
        'has-issues': hasIssues,
        'is-dragging': isDragging,
        'is-drop-target': isDropTarget,
      },
    ]"
    role="button"
    tabindex="0"
    :aria-pressed="isSelected"
    @click="onSelect"
    @keydown.enter.prevent="onSelect"
    @keydown.space.prevent="onSelect"
  >
    <div class="builder-field-wrapper__toolbar" aria-hidden="true">
      <button
        type="button"
        class="builder-field-wrapper__handle"
        draggable="true"
        :title="t('builder.canvas.dragHandle')"
        :aria-label="t('builder.canvas.dragHandle')"
        @click.stop
        @dragstart="onDragStart"
        @dragend="onDragEnd"
      >
        ⋮⋮
      </button>
    </div>
    <div class="builder-field-wrapper__body">
      <slot />
    </div>
    <div class="builder-field-wrapper__actions">
      <button
        type="button"
        class="builder-field-wrapper__action"
        :title="t('builder.canvas.duplicate')"
        :aria-label="t('builder.canvas.duplicate')"
        @click="onDuplicate"
      >
        ⧉
      </button>
      <button
        type="button"
        class="builder-field-wrapper__action builder-field-wrapper__action--danger"
        :title="t('builder.canvas.remove')"
        :aria-label="t('builder.canvas.remove')"
        @click="onRemove"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.builder-field-wrapper {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
  width: 100%;
}

.builder-field-wrapper:hover {
  border-color: var(--color-primary-300);
}

.builder-field-wrapper.is-selected {
  border-color: var(--color-primary-600);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.builder-field-wrapper.has-issues {
  border-color: var(--color-danger-600);
}

.builder-field-wrapper.has-issues.is-selected {
  box-shadow: 0 0 0 3px var(--color-danger-100);
}

.builder-field-wrapper.is-dragging {
  opacity: 0.4;
}

.builder-field-wrapper.is-drop-target {
  border-style: dashed;
  border-color: var(--color-primary-600);
}

.builder-field-wrapper--full {
  flex: 1 1 100%;
}
.builder-field-wrapper--half {
  flex: 1 1 calc(50% - var(--space-2));
}
.builder-field-wrapper--third {
  flex: 1 1 calc(33.333% - var(--space-2));
}
.builder-field-wrapper--quarter {
  flex: 1 1 calc(25% - var(--space-2));
}

.builder-field-wrapper__toolbar {
  display: flex;
  align-items: center;
}

.builder-field-wrapper__handle {
  background: transparent;
  border: 0;
  cursor: grab;
  color: var(--color-text-subtle);
  font-size: 1.1rem;
  padding: 0 var(--space-1);
}

.builder-field-wrapper__handle:active {
  cursor: grabbing;
}

.builder-field-wrapper__body {
  flex: 1;
  min-width: 0;
}

.builder-field-wrapper__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  opacity: 0;
  transition: opacity 120ms ease;
}

.builder-field-wrapper:hover .builder-field-wrapper__actions,
.builder-field-wrapper.is-selected .builder-field-wrapper__actions {
  opacity: 1;
}

.builder-field-wrapper__action {
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  width: 1.75rem;
  height: 1.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.builder-field-wrapper__action:hover {
  background: var(--color-surface);
}

.builder-field-wrapper__action--danger {
  color: var(--color-danger-600);
}

.builder-field-wrapper__action--danger:hover {
  background: var(--color-danger-100);
}
</style>
