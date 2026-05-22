<script setup>
// Accessible modal dialog. Visibility is driven by `v-model` (boolean) so
// parents own the open state. Emits `close` when the backdrop, the close
// button, or the Escape key is used.
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  closeOnBackdrop: { type: Boolean, default: true },
});

const emit = defineEmits(['update:modelValue', 'close']);

const dialogRef = ref(null);

const close = () => {
  emit('update:modelValue', false);
  emit('close');
};

const onKeyDown = (event) => {
  if (event.key === 'Escape') close();
};

watch(
  () => props.modelValue,
  (open) => {
    if (typeof document === 'undefined') return;
    if (open) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKeyDown);
      // Defer focus until the dialog is rendered.
      queueMicrotask(() => dialogRef.value?.focus());
    } else {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    }
  },
);

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKeyDown);
});

const onBackdrop = () => {
  if (props.closeOnBackdrop) close();
};
</script>

<template>
  <Teleport to="body">
    <transition name="app-modal">
      <div v-if="modelValue" class="app-modal" role="presentation" @click.self="onBackdrop">
        <div
          ref="dialogRef"
          class="app-modal__dialog"
          :class="`app-modal__dialog--${size}`"
          role="dialog"
          aria-modal="true"
          :aria-label="title || undefined"
          tabindex="-1"
        >
          <header v-if="title || $slots.header" class="app-modal__header">
            <slot name="header">
              <h3 class="app-modal__title">{{ title }}</h3>
            </slot>
            <button type="button" class="app-modal__close" aria-label="Close" @click="close">
              &times;
            </button>
          </header>
          <div class="app-modal__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="app-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.app-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: var(--layout-z-modal, 60);
}

.app-modal__dialog {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-modal__dialog--sm {
  max-width: 22rem;
}
.app-modal__dialog--md {
  max-width: 32rem;
}
.app-modal__dialog--lg {
  max-width: 48rem;
}

.app-modal__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.app-modal__title {
  margin: 0;
  font-size: var(--font-size-lg);
}

.app-modal__close {
  margin-left: auto;
  background: transparent;
  border: 0;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--color-text-muted);
}

.app-modal__body {
  padding: var(--space-4);
  overflow: auto;
}

.app-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.app-modal-enter-active,
.app-modal-leave-active {
  transition: opacity 120ms ease;
}
.app-modal-enter-from,
.app-modal-leave-to {
  opacity: 0;
}
</style>
